"use client";

// ponytail: single-file canvas editor, split when it hurts
// ponytail: no pinch-zoom / touch gestures yet — desktop-first editor
//           upgrade path: add pointer event multi-touch handling

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, Pencil, Hand, Undo2, Trash2,
  Upload, Check, X, ZoomIn, ZoomOut, MapPin, DraftingCompass
} from "lucide-react";

/* ─── Types ──────────────────────────────────────────── */
interface WP {
  id: string;
  px: number;
  py: number;
  label: string;
  type: "turn" | "destination" | "qr_checkpoint";
  headingDeg?: number;
}
interface Ed { from: string; to: string; meters?: number }
type Tool = "pan" | "waypoint" | "edge" | "angle" | "eraser";

/* ─── Constants ──────────────────────────────────────── */
const WP_R = 14;       // waypoint hit radius (screen px)
const EDGE_HIT = 10;   // edge hit distance (screen px)
const GRID = 50;        // grid spacing (world px)
const DRAG_THRESH = 4;  // min px to count as drag

/* ─── Helpers ────────────────────────────────────────── */
function ptSegDist(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax, dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - ax, py - ay);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function findSharedWP(e1: Ed, e2: Ed): string | null {
  if (e1.from === e2.from || e1.from === e2.to) return e1.from;
  if (e1.to === e2.from || e1.to === e2.to) return e1.to;
  return null;
}

function calcAngleDeg(e1: Ed, e2: Ed, sharedId: string, wps: WP[]): number {
  const s = wps.find(w => w.id === sharedId)!;
  const f1 = wps.find(w => w.id === (e1.from === sharedId ? e1.to : e1.from))!;
  const f2 = wps.find(w => w.id === (e2.from === sharedId ? e2.to : e2.from))!;
  const v1x = f1.px - s.px, v1y = f1.py - s.py;
  const v2x = f2.px - s.px, v2y = f2.py - s.py;
  const dot = v1x * v2x + v1y * v2y;
  const cross = v1x * v2y - v1y * v2x;
  let deg = Math.atan2(Math.abs(cross), dot) * 180 / Math.PI;
  return deg;
}

/* ─── Component ──────────────────────────────────────── */
export default function MapEditorScene() {
  const router = useRouter();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Core data
  const [wps, setWps] = useState<WP[]>([]);
  const [eds, setEds] = useState<Ed[]>([]);
  const nextIdRef = useRef(1);

  // Interaction
  const [tool, setTool] = useState<Tool>("waypoint");
  const [edgeFrom, setEdgeFrom] = useState<string | null>(null);
  const [selEdge, setSelEdge] = useState<number | null>(null);

  // Ruler/Angle state
  interface AngleLock {
    id: string;
    sharedWpId: string;
    wp1Id: string;
    wp2Id: string;
    deg: number;
  }
  const [angleLocks, setAngleLocks] = useState<AngleLock[]>([]);
  const [rulerEdges, setRulerEdges] = useState<number[]>([]);
  const [showAngle, setShowAngle] = useState(false);
  const [angleVal, setAngleVal] = useState("");

  // Waypoint Editor Modal state
  const [showWpModal, setShowWpModal] = useState(false);
  const [selWpId, setSelWpId] = useState<string | null>(null);
  const [wpLabel, setWpLabel] = useState("");
  const [wpType, setWpType] = useState<"turn" | "destination" | "qr_checkpoint">("turn");
  const [wpHeading, setWpHeading] = useState("0");

  // Scale calibration
  const [ppm, setPpm] = useState<number | null>(null); // pixels-per-meter
  const [showDist, setShowDist] = useState(false);
  const [distVal, setDistVal] = useState("");

  // Camera (x, y = pan offset in screen px, z = zoom)
  const [cam, setCam] = useState({ x: 0, y: 0, z: 1 });
  const camRef = useRef(cam);
  useEffect(() => { camRef.current = cam; }, [cam]);

  // Blueprint backdrop
  const [bg, setBg] = useState<HTMLImageElement | null>(null);

  // Save modal
  const [showSave, setShowSave] = useState(false);
  const [mapName, setMapName] = useState("");
  const [saving, setSaving] = useState(false);
  const [proximityRadius, setProximityRadius] = useState("1.5");

  // Undo history
  const histRef = useRef<{ w: WP[]; e: Ed[] }[]>([]);

  // Mouse position for edge preview
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);
  const [tick, setTick] = useState(0);

  // Pan drag tracking
  const panRef = useRef({ active: false, sx: 0, sy: 0, cx: 0, cy: 0, moved: false });

  /* ─── Coordinate transform ─────────────────────────── */
  const s2w = useCallback((sx: number, sy: number) => ({
    x: (sx - cam.x) / cam.z,
    y: (sy - cam.y) / cam.z,
  }), [cam]);

  /* ─── Hit tests ────────────────────────────────────── */
  const hitWP = useCallback((wx: number, wy: number): WP | null => {
    const r = WP_R / cam.z;
    for (let i = wps.length - 1; i >= 0; i--) {
      if (Math.hypot(wps[i].px - wx, wps[i].py - wy) <= r) return wps[i];
    }
    return null;
  }, [wps, cam.z]);

  const hitEdge = useCallback((wx: number, wy: number): number | null => {
    const t = EDGE_HIT / cam.z;
    for (let i = eds.length - 1; i >= 0; i--) {
      const a = wps.find(w => w.id === eds[i].from);
      const b = wps.find(w => w.id === eds[i].to);
      if (!a || !b) continue;
      if (ptSegDist(wx, wy, a.px, a.py, b.px, b.py) <= t) return i;
    }
    return null;
  }, [wps, eds, cam.z]);

  const hitAngleLock = useCallback((wx: number, wy: number): AngleLock | null => {
    for (const lock of angleLocks) {
      const s = wps.find(w => w.id === lock.sharedWpId);
      const f1 = wps.find(w => w.id === lock.wp1Id);
      const f2 = wps.find(w => w.id === lock.wp2Id);
      if (!s || !f1 || !f2) continue;

      const d = Math.hypot(wx - s.px, wy - s.py);
      const screenDist = d * cam.z;

      if (screenDist >= 10 && screenDist <= 40) {
        const a1 = Math.atan2(f1.py - s.py, f1.px - s.px);
        const a2 = Math.atan2(f2.py - s.py, f2.px - s.px);
        const am = Math.atan2(wy - s.py, wx - s.px);

        const minRaw = Math.min(a1, a2);
        const maxRaw = Math.max(a1, a2);

        if (am >= minRaw && am <= maxRaw) {
          return lock;
        }
      }
    }
    return null;
  }, [wps, angleLocks, cam.z]);

  /* ─── Push undo snapshot ───────────────────────────── */
  const pushHist = useCallback(() => {
    histRef.current.push({ w: structuredClone(wps), e: structuredClone(eds) });
    if (histRef.current.length > 50) histRef.current.shift();
  }, [wps, eds]);

  /* ─── Canvas rendering ─────────────────────────────── */
  useEffect(() => {
    const cv = canvasRef.current;
    const wrap = wrapRef.current;
    if (!cv || !wrap) return;

    const rect = wrap.getBoundingClientRect();
    const dpr = devicePixelRatio || 1;
    cv.width = rect.width * dpr;
    cv.height = rect.height * dpr;
    cv.style.width = `${rect.width}px`;
    cv.style.height = `${rect.height}px`;

    const ctx = cv.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Background
    ctx.fillStyle = "#0f172a";
    ctx.fillRect(0, 0, rect.width, rect.height);

    ctx.save();
    ctx.translate(cam.x, cam.y);
    ctx.scale(cam.z, cam.z);

    // Grid
    const l = -cam.x / cam.z, t2 = -cam.y / cam.z;
    const r2 = (rect.width - cam.x) / cam.z, b2 = (rect.height - cam.y) / cam.z;
    ctx.strokeStyle = "rgba(255,255,255,0.04)";
    ctx.lineWidth = 1 / cam.z;
    const sx = Math.floor(l / GRID) * GRID;
    const sy = Math.floor(t2 / GRID) * GRID;
    for (let x = sx; x <= r2; x += GRID) {
      ctx.beginPath(); ctx.moveTo(x, t2); ctx.lineTo(x, b2); ctx.stroke();
    }
    for (let y = sy; y <= b2; y += GRID) {
      ctx.beginPath(); ctx.moveTo(l, y); ctx.lineTo(r2, y); ctx.stroke();
    }

    // Backdrop image (blueprint mode)
    if (bg) {
      ctx.globalAlpha = 0.35;
      ctx.drawImage(bg, 0, 0);
      ctx.globalAlpha = 1;
    }

    // Edges
    eds.forEach((e, i) => {
      const a = wps.find(w => w.id === e.from);
      const b = wps.find(w => w.id === e.to);
      if (!a || !b) return;

      const sel = i === selEdge;
      const rulerSel = rulerEdges.includes(i);
      const isSelected = sel || rulerSel;
      const cal = e.meters != null;
      const isEraserHover = tool === "eraser" && mousePos && hitEdge(mousePos.x, mousePos.y) === i;

      // Glow for selected/hovered edges
      if (isSelected || isEraserHover) {
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(a.px, a.py);
        ctx.lineTo(b.px, b.py);
        ctx.strokeStyle = isEraserHover ? "rgba(239,68,68,0.4)" : rulerSel ? "rgba(245,158,11,0.4)" : "rgba(168,85,247,0.4)";
        ctx.lineWidth = 14 / cam.z;
        ctx.stroke();
        ctx.restore();
      }

      ctx.beginPath();
      ctx.moveTo(a.px, a.py);
      ctx.lineTo(b.px, b.py);
      ctx.strokeStyle = isEraserHover ? "#ef4444" : isSelected ? (rulerSel ? "#f59e0b" : "#a855f7") : cal ? "#22c55e" : "#64748b";
      ctx.lineWidth = (isSelected || isEraserHover ? 4 : 2.5) / cam.z;
      ctx.stroke();

      // Distance label
      const pxDist = Math.hypot(b.px - a.px, b.py - a.py);
      let label = "";
      if (cal) label = `${e.meters} m ★`;
      else if (ppm) label = `${(pxDist / ppm).toFixed(1)} m`;

      if (label) {
        const fs = Math.max(10, 13 / cam.z);
        ctx.font = `bold ${fs}px sans-serif`;
        ctx.fillStyle = isEraserHover ? "#f87171" : cal ? "#22c55e" : "#c4b5fd";
        ctx.textAlign = "center";
        ctx.fillText(label, (a.px + b.px) / 2, (a.py + b.py) / 2 - 10 / cam.z);
      }
    });

    // Angle arc between two selected adjacent edges for angle adjustment
    if (rulerEdges.length === 2) {
      const e1 = eds[rulerEdges[0]], e2 = eds[rulerEdges[1]];
      if (e1 && e2) {
        const sharedId = findSharedWP(e1, e2);
        if (sharedId) {
          const s = wps.find(w => w.id === sharedId)!;
          const f1 = wps.find(w => w.id === (e1.from === sharedId ? e1.to : e1.from))!;
          const f2 = wps.find(w => w.id === (e2.from === sharedId ? e2.to : e2.from))!;
          const a1 = Math.atan2(f1.py - s.py, f1.px - s.px);
          const a2 = Math.atan2(f2.py - s.py, f2.px - s.px);
          const arcR = 30 / cam.z;
          ctx.beginPath();
          ctx.arc(s.px, s.py, arcR, Math.min(a1, a2), Math.max(a1, a2));
          ctx.strokeStyle = "#f59e0b";
          ctx.lineWidth = 2 / cam.z;
          ctx.stroke();
          
          // Angle label
          const midA = (a1 + a2) / 2;
          const labelR = arcR + 14 / cam.z;
          const deg = calcAngleDeg(e1, e2, sharedId, wps);
          const fs = Math.max(10, 12 / cam.z);
          ctx.font = `bold ${fs}px sans-serif`;
          ctx.fillStyle = "#fbbf24";
          ctx.textAlign = "center";
          ctx.fillText(`${deg.toFixed(1)}°`, s.px + labelR * Math.cos(midA), s.py + labelR * Math.sin(midA));
        }
      }
    }

    // Edge preview (dashed line following mouse in edge tool)
    if (tool === "edge" && edgeFrom && mousePos) {
      const a = wps.find(w => w.id === edgeFrom);
      const hoverWp = hitWP(mousePos.x, mousePos.y);
      if (a) {
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(a.px, a.py);
        const targetX = hoverWp ? hoverWp.px : mousePos.x;
        const targetY = hoverWp ? hoverWp.py : mousePos.y;
        ctx.lineTo(targetX, targetY);
        ctx.strokeStyle = "rgba(168, 85, 247, 0.5)";
        ctx.lineWidth = 2.5 / cam.z;
        ctx.setLineDash([6 / cam.z, 4 / cam.z]);
        ctx.stroke();
        ctx.restore();
      }
    }

    // Waypoint preview in waypoint tool (green if hovering on edge, purple if on empty space)
    if (tool === "waypoint" && mousePos) {
      const hoverWp = hitWP(mousePos.x, mousePos.y);
      const hoverEd = hitEdge(mousePos.x, mousePos.y);
      const r = WP_R / cam.z;

      if (!hoverWp) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(mousePos.x, mousePos.y, r, 0, Math.PI * 2);
        ctx.fillStyle = hoverEd !== null ? "rgba(34, 197, 94, 0.4)" : "rgba(168, 85, 247, 0.4)";
        ctx.fill();
        ctx.strokeStyle = hoverEd !== null ? "rgba(34, 197, 94, 0.6)" : "rgba(255, 255, 255, 0.4)";
        ctx.lineWidth = 2 / cam.z;
        ctx.setLineDash([4 / cam.z, 2 / cam.z]);
        ctx.stroke();
        ctx.restore();
      }
    }

    // Waypoints rendering
    wps.forEach((wp, i) => {
      const r = WP_R / cam.z;
      const first = i === 0;
      const isQr = wp.type === "qr_checkpoint";
      const isDest = wp.type === "destination";
      const isEraserHover = tool === "eraser" && mousePos && hitWP(mousePos.x, mousePos.y)?.id === wp.id;

      ctx.beginPath();
      ctx.arc(wp.px, wp.py, r, 0, Math.PI * 2);
      ctx.fillStyle = isEraserHover ? "#ef4444" : first ? "#3b82f6" : isQr ? "#f59e0b" : isDest ? "#ec4899" : "#8b5cf6";
      ctx.fill();
      ctx.strokeStyle = isEraserHover ? "#f87171" : isQr ? "#fbbf24" : "#fff";
      ctx.lineWidth = (isEraserHover ? 4 : isQr ? 3 : 2) / cam.z;
      ctx.stroke();

      // ID label
      const fs = Math.max(9, 11 / cam.z);
      ctx.font = `bold ${fs}px sans-serif`;
      ctx.fillStyle = "#fff";
      ctx.textAlign = "center";
      ctx.fillText(wp.id, wp.px, wp.py - r - 4 / cam.z);

      let subLabel = "";
      if (first) subLabel = "START";
      else if (isQr) subLabel = `QR (${wp.headingDeg || 0}°)`;
      else if (isDest) subLabel = wp.label;

      if (subLabel) {
        const subFs = Math.max(8, 10 / cam.z);
        ctx.font = `bold ${subFs}px sans-serif`;
        ctx.fillStyle = first ? "#93c5fd" : isQr ? "#fbbf24" : "#fbcfe8";
        ctx.fillText(subLabel, wp.px, wp.py + r + subFs + 2 / cam.z);
      }
    });

    // Draw Locked Angles
    angleLocks.forEach(lock => {
      const s = wps.find(w => w.id === lock.sharedWpId);
      const f1 = wps.find(w => w.id === lock.wp1Id);
      const f2 = wps.find(w => w.id === lock.wp2Id);
      if (s && f1 && f2) {
        const isEraserHover = tool === "eraser" && mousePos && hitAngleLock(mousePos.x, mousePos.y)?.id === lock.id;
        const a1 = Math.atan2(f1.py - s.py, f1.px - s.px);
        const a2 = Math.atan2(f2.py - s.py, f2.px - s.px);
        const arcR = 25 / cam.z;
        ctx.save();
        ctx.beginPath();
        ctx.arc(s.px, s.py, arcR, Math.min(a1, a2), Math.max(a1, a2));
        ctx.strokeStyle = isEraserHover ? "rgba(239,68,68,0.9)" : "rgba(245,158,11,0.6)";
        ctx.lineWidth = (isEraserHover ? 3.5 : 2) / cam.z;
        if (!isEraserHover) {
          ctx.setLineDash([2 / cam.z, 2 / cam.z]);
        }
        ctx.stroke();
        ctx.restore();
      }
    });

    ctx.restore();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wps, eds, cam, bg, selEdge, edgeFrom, ppm, tick, rulerEdges, tool, mousePos, angleLocks]);

  /* ─── Init camera center ───────────────────────────── */
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const rect = wrap.getBoundingClientRect();
    setCam({ x: rect.width / 2, y: rect.height / 2, z: 1 });
  }, []);

  /* ─── Resize observer ──────────────────────────────── */
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const ro = new ResizeObserver(() => setTick(t => t + 1));
    ro.observe(wrap);
    return () => ro.disconnect();
  }, []);

  /* ─── Keyboard shortcuts ───────────────────────────── */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "SELECT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }

      if (e.ctrlKey && e.key === "z") {
        e.preventDefault();
        const snap = histRef.current.pop();
        if (snap) {
          setWps(snap.w);
          setEds(snap.e);
          setEdgeFrom(null);
          setRulerEdges([]);
          nextIdRef.current = snap.w.length > 0
            ? Math.max(...snap.w.map(w => parseInt(w.id.slice(1)))) + 1
            : 1;
        }
      }
      if (e.key === "Escape") { setEdgeFrom(null); setSelEdge(null); setRulerEdges([]); }
      if (e.key === "Delete" || e.key === "Backspace") {
        if (selEdge !== null) {
          pushHist();
          const edgeToDelete = eds[selEdge];
          setEds(prev => prev.filter((_, i) => i !== selEdge));
          
          // ลบล็อกมุมที่ใช้ edge นี้
          setAngleLocks(prev => prev.filter(lock => {
            const isEdge1 = (edgeToDelete.from === lock.sharedWpId && edgeToDelete.to === lock.wp1Id) || (edgeToDelete.to === lock.sharedWpId && edgeToDelete.from === lock.wp1Id);
            const isEdge2 = (edgeToDelete.from === lock.sharedWpId && edgeToDelete.to === lock.wp2Id) || (edgeToDelete.to === lock.sharedWpId && edgeToDelete.from === lock.wp2Id);
            return !isEdge1 && !isEdge2;
          }));
          setSelEdge(null);
        } else if (selWpId !== null) {
          pushHist();
          setWps(prev => prev.filter(w => w.id !== selWpId));
          setEds(prev => prev.filter(x => x.from !== selWpId && x.to !== selWpId));
          
          // ลบล็อกมุมที่ใช้ waypoint นี้
          setAngleLocks(prev => prev.filter(l => l.sharedWpId !== selWpId && l.wp1Id !== selWpId && l.wp2Id !== selWpId));
          if (edgeFrom === selWpId) setEdgeFrom(null);
          setSelWpId(null);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selEdge, selWpId, edgeFrom, eds]);

  /* ─── Zoom (native wheel, passive: false) ──────────── */
  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = cv.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const factor = e.deltaY < 0 ? 1.1 : 0.9;
      setCam(prev => {
        const nz = Math.max(0.1, Math.min(5, prev.z * factor));
        return {
          x: mx - (mx - prev.x) * (nz / prev.z),
          y: my - (my - prev.y) * (nz / prev.z),
          z: nz,
        };
      });
    };
    cv.addEventListener("wheel", onWheel, { passive: false });
    return () => cv.removeEventListener("wheel", onWheel);
  }, []);

  /* ─── Pointer helpers ──────────────────────────────── */
  const getWorld = (e: React.PointerEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return s2w(e.clientX - rect.left, e.clientY - rect.top);
  };

  /* ─── Pointer down ─────────────────────────────────── */
  const handleDown = (e: React.PointerEvent) => {
    canvasRef.current?.setPointerCapture(e.pointerId);
    const w = getWorld(e);

    // Pan mode
    if (tool === "pan") {
      panRef.current = { active: true, sx: e.clientX, sy: e.clientY, cx: cam.x, cy: cam.y, moved: false };
      return;
    }

    // Waypoint tool: create, insert (split edge), or edit waypoint details
    if (tool === "waypoint") {
      const wp = hitWP(w.x, w.y);
      if (wp) {
        setSelWpId(wp.id);
        setWpLabel(wp.label);
        setWpType(wp.type || "turn");
        setWpHeading(wp.headingDeg?.toString() || "0");
        setShowWpModal(true);
        return;
      }

      // Check if clicking on an edge to insert/split edge
      const ei = hitEdge(w.x, w.y);
      if (ei !== null) {
        pushHist();
        const edgeToSplit = eds[ei];
        const newId = `W${nextIdRef.current}`;
        nextIdRef.current++;

        const newWp: WP = {
          id: newId,
          px: w.x,
          py: w.y,
          label: `จุดที่ ${parseInt(newId.slice(1))}`,
          type: "turn"
        };

        setWps(prev => [...prev, newWp]);
        setEds(prev => {
          const nextEds = prev.filter((_, idx) => idx !== ei);
          return [
            ...nextEds,
            { from: edgeToSplit.from, to: newId, meters: edgeToSplit.meters ? edgeToSplit.meters / 2 : undefined },
            { from: newId, to: edgeToSplit.to, meters: edgeToSplit.meters ? edgeToSplit.meters / 2 : undefined }
          ];
        });
        return;
      }

      // Empty space -> drag check (will place WP in up if not dragged)
      panRef.current = { active: true, sx: e.clientX, sy: e.clientY, cx: cam.x, cy: cam.y, moved: false };
      return;
    }

    // Edge tool: connect nodes or calibrate edge distance
    if (tool === "edge") {
      const wp = hitWP(w.x, w.y);
      if (wp) {
        if (edgeFrom) {
          // Connect points
          if (edgeFrom !== wp.id && !eds.some(x => (x.from === edgeFrom && x.to === wp.id) || (x.from === wp.id && x.to === edgeFrom))) {
            pushHist();
            setEds(prev => [...prev, { from: edgeFrom!, to: wp.id }]);
          }
          setEdgeFrom(null);
        } else {
          setEdgeFrom(wp.id);
        }
        setSelEdge(null);
        return;
      }

      const ei = hitEdge(w.x, w.y);
      if (ei !== null) {
        setSelEdge(ei);
        setEdgeFrom(null);
        setDistVal(eds[ei].meters?.toString() || "");
        setShowDist(true);
        return;
      }

      // Empty space -> allow panning
      panRef.current = { active: true, sx: e.clientX, sy: e.clientY, cx: cam.x, cy: cam.y, moved: false };
      return;
    }

    // Angle tool: select 2 adjacent edges to adjust angle
    if (tool === "angle") {
      const ei = hitEdge(w.x, w.y);
      if (ei !== null) {
        if (rulerEdges.length === 0) {
          setRulerEdges([ei]);
        } else if (rulerEdges.length === 1 && ei !== rulerEdges[0]) {
          const shared = findSharedWP(eds[rulerEdges[0]], eds[ei]);
          if (shared) {
            setRulerEdges([rulerEdges[0], ei]);
            setAngleVal(calcAngleDeg(eds[rulerEdges[0]], eds[ei], shared, wps).toFixed(1));
            setShowAngle(true);
          } else {
            // Not adjacent -> reset to this edge
            setRulerEdges([ei]);
          }
        } else {
          // Clicked same edge -> reset
          setRulerEdges([]);
        }
      } else {
        setRulerEdges([]);
        panRef.current = { active: true, sx: e.clientX, sy: e.clientY, cx: cam.x, cy: cam.y, moved: false };
      }
      return;
    }

    // Eraser tool: delete waypoint, edge, or angle lock
    if (tool === "eraser") {
      const wp = hitWP(w.x, w.y);
      if (wp) {
        pushHist();
        setWps(prev => prev.filter(x => x.id !== wp.id));
        setEds(prev => prev.filter(x => x.from !== wp.id && x.to !== wp.id));
        setAngleLocks(prev => prev.filter(l => l.sharedWpId !== wp.id && l.wp1Id !== wp.id && l.wp2Id !== wp.id));
        if (edgeFrom === wp.id) setEdgeFrom(null);
        return;
      }

      const ei = hitEdge(w.x, w.y);
      if (ei !== null) {
        pushHist();
        const edgeToDelete = eds[ei];
        setEds(prev => prev.filter((_, idx) => idx !== ei));
        setAngleLocks(prev => prev.filter(lock => {
          const isEdge1 = (edgeToDelete.from === lock.sharedWpId && edgeToDelete.to === lock.wp1Id) || (edgeToDelete.to === lock.sharedWpId && edgeToDelete.from === lock.wp1Id);
          const isEdge2 = (edgeToDelete.from === lock.sharedWpId && edgeToDelete.to === lock.wp2Id) || (edgeToDelete.to === lock.sharedWpId && edgeToDelete.from === lock.wp2Id);
          return !isEdge1 && !isEdge2;
        }));
        return;
      }

      const lock = hitAngleLock(w.x, w.y);
      if (lock) {
        pushHist();
        setAngleLocks(prev => prev.filter(l => l.id !== lock.id));
        return;
      }

      panRef.current = { active: true, sx: e.clientX, sy: e.clientY, cx: cam.x, cy: cam.y, moved: false };
      return;
    }
  };

  /* ─── Pointer move ─────────────────────────────────── */
  const handleMove = (e: React.PointerEvent) => {
    const w = getWorld(e);
    setMousePos(w);

    if (panRef.current.active) {
      const dx = e.clientX - panRef.current.sx;
      const dy = e.clientY - panRef.current.sy;
      if (Math.hypot(dx, dy) > DRAG_THRESH || panRef.current.moved) {
        panRef.current.moved = true;
        setCam(prev => ({
          ...prev,
          x: panRef.current.cx + dx,
          y: panRef.current.cy + dy,
        }));
      }
      return;
    }
  };

  /* ─── Pointer up ───────────────────────────────────── */
  const handleUp = (e: React.PointerEvent) => {
    canvasRef.current?.releasePointerCapture(e.pointerId);

    if (panRef.current.active) {
      const wasDrag = panRef.current.moved;
      panRef.current = { active: false, sx: 0, sy: 0, cx: 0, cy: 0, moved: false };

      if (!wasDrag && tool === "waypoint") {
        const w = getWorld(e);
        const id = `W${nextIdRef.current}`;
        nextIdRef.current++;
        pushHist();
        setWps(prev => [...prev, {
          id,
          px: w.x,
          py: w.y,
          label: `จุดที่ ${parseInt(id.slice(1))}`,
          type: "turn"
        }]);
        setSelEdge(null);
      }
    }
  };

  /* ─── File upload (blueprint mode) ─────────────────── */
  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const fitImage = (img: HTMLImageElement) => {
      setBg(img);
      const wrap = wrapRef.current;
      if (wrap) {
        const rect = wrap.getBoundingClientRect();
        const fitZ = Math.min(rect.width * 0.9 / img.width, rect.height * 0.9 / img.height, 1);
        setCam({
          x: rect.width / 2 - (img.width / 2) * fitZ,
          y: rect.height / 2 - (img.height / 2) * fitZ,
          z: fitZ,
        });
      }
    };

    if (file.type === "application/pdf") {
      try {
        const pdfjsLib = await import("pdfjs-dist");
        pdfjsLib.GlobalWorkerOptions.workerSrc =
          `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

        const data = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data }).promise;
        const page = await pdf.getPage(1);
        const vp = page.getViewport({ scale: 2 });
        const oc = document.createElement("canvas");
        oc.width = vp.width;
        oc.height = vp.height;
        await page.render({ canvas: oc, canvasContext: oc.getContext("2d")!, viewport: vp }).promise;
        const img = new Image();
        img.onload = () => fitImage(img);
        img.src = oc.toDataURL();
      } catch (err) {
        alert("อ่าน PDF ไม่ได้ — ลองอัปโหลดเป็นรูปภาพแทน\nหรือติดตั้ง pdfjs-dist: pnpm add pdfjs-dist");
        console.error(err);
      }
    } else {
      // Image file (PNG, JPG, etc.)
      const img = new Image();
      img.onload = () => fitImage(img);
      img.src = URL.createObjectURL(file);
    }
  };

  /* ─── Distance calibration submit ──────────────────── */
  const handleDistSubmit = () => {
    const m = parseFloat(distVal);
    if (isNaN(m) || m <= 0 || selEdge === null) return;

    const e = eds[selEdge];

    // ตรวจเช็คว่ามีมุมไหนที่เกี่ยวข้องล็อกอยู่หรือไม่
    const hasLock = angleLocks.some(lock => {
      const isEdge1 = (e.from === lock.sharedWpId && e.to === lock.wp1Id) || (e.to === lock.sharedWpId && e.from === lock.wp1Id);
      const isEdge2 = (e.from === lock.sharedWpId && e.to === lock.wp2Id) || (e.to === lock.sharedWpId && e.from === lock.wp2Id);
      return isEdge1 || isEdge2;
    });

    if (hasLock && ppm !== null) {
      alert("⚠️ ไม่สามารถปรับระยะเส้นนี้ได้เนื่องจากติดเงื่อนไขการล็อกมุมอยู่!\nกรุณาไปลบเงื่อนไขมุมออกก่อน");
      return;
    }

    const a = wps.find(w => w.id === e.from);
    const b = wps.find(w => w.id === e.to);
    if (!a || !b) return;

    pushHist();

    if (ppm === null) {
      // ตั้งค่าสเกลแผนที่ครั้งแรก
      const newPpm = Math.hypot(b.px - a.px, b.py - a.py) / m;
      setEds(prev => prev.map((ed, i) => i === selEdge ? { ...ed, meters: m } : ed));
      setPpm(newPpm);
    } else {
      // ปรับขนาดความยาวจริงใน UI (ขยับจุด b)
      const dx = b.px - a.px;
      const dy = b.py - a.py;
      const curDist = Math.hypot(dx, dy);
      if (curDist > 0) {
        const targetDist = m * ppm;
        const ratio = targetDist / curDist;
        setWps(prev => prev.map(w => w.id === b.id ? { ...w, px: a.px + dx * ratio, py: a.py + dy * ratio } : w));
        setEds(prev => prev.map((ed, i) => i === selEdge ? { ...ed, meters: m } : ed));
      }
    }

    setShowDist(false);
    setSelEdge(null);
  };

  /* ─── Save to DB ───────────────────────────────────── */
  const canSave = wps.length >= 2 && eds.length >= 1 && ppm != null;

  const handleSave = async () => {
    if (!mapName.trim()) { alert("กรุณากรอกชื่อ"); return; }
    setSaving(true);

    const mapId = `map_${Date.now()}`;
    const w1 = wps[0];

    // Convert pixel → meter coordinates (relative to W1)
    const wpObj: Record<string, any> = {};
    wps.forEach(wp => {
      wpObj[wp.id] = {
        x: Number(((wp.px - w1.px) / ppm!).toFixed(3)),
        z: Number(((wp.py - w1.py) / ppm!).toFixed(3)),
        label: wp.label,
        type: wp.type || "turn",
        ...(wp.type === "qr_checkpoint" ? { headingDeg: wp.headingDeg || 0 } : {})
      };
    });

    const edgeArr = eds.map(e => [e.from, e.to]);

    // Gather custom destinations first
    const dests: any[] = [];
    wps.forEach(wp => {
      if (wp.type === "destination") {
        dests.push({
          id: `dest_${wp.id}`,
          name: wp.label,
          waypoint: wp.id,
          icon: "🏪",
          description: "ร้านค้า/ปลายทาง",
        });
      }
    });

    // Fallback to auto-gen demo destinations if none defined
    if (dests.length === 0) {
      const demo = [
        { icon: "🏪", name: "ร้านค้า (Demo)", desc: "จุดแวะพัก" },
        { icon: "☕", name: "ร้านกาแฟ (Demo)", desc: "เครื่องดื่ม" },
        { icon: "👕", name: "ร้านเสื้อผ้า (Demo)", desc: "แฟชั่น" },
        { icon: "🚻", name: "ห้องน้ำ (Demo)", desc: "สิ่งอำนวยความสะดวก" },
        { icon: "🏁", name: "จุดหมาย (Demo)", desc: "ปลายทาง" },
      ];
      const avail = Object.keys(wpObj).slice(1);
      const n = Math.min(5, avail.length);
      for (let i = 0; i < n; i++) {
        const idx = Math.floor((i / Math.max(1, n - 1)) * (avail.length - 1));
        const wid = avail[idx];
        if (!dests.some(d => d.waypoint === wid)) {
          dests.push({ id: `dest_${wid}`, name: demo[i].name, waypoint: wid, icon: demo[i].icon, description: demo[i].desc });
          wpObj[wid].type = "destination";
        }
      }
    }

    try {
      const res = await fetch("/api/stores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: mapId,
          name: mapName,
          floor: 1,
          initialHeadingDeg: 0,
          proximityRadiusM: parseFloat(proximityRadius) || 1.5,
          waypointsJson: JSON.stringify(wpObj),
          edgesJson: JSON.stringify(edgeArr),
          destinationsJson: JSON.stringify(dests),
          comment: "สร้างจากโหมดวาด Canvas",
        }),
      });
      if (!res.ok) throw new Error();
      router.push("/dashboard");
    } catch {
      alert("เซฟล้มเหลว กรุณาลองใหม่");
      setSaving(false);
    }
  };

  /* ─── Angle submit handler ─────────────────────────── */
  const handleAngleSubmit = () => {
    const targetDeg = parseFloat(angleVal);
    if (isNaN(targetDeg) || targetDeg <= 0 || targetDeg >= 360) return;
    if (rulerEdges.length !== 2) return;

    const e1 = eds[rulerEdges[0]], e2 = eds[rulerEdges[1]];
    const sharedId = findSharedWP(e1, e2);
    if (!sharedId) return;

    const s = wps.find(w => w.id === sharedId)!;
    const f1Id = e1.from === sharedId ? e1.to : e1.from;
    const f2Id = e2.from === sharedId ? e2.to : e2.from;
    const f1 = wps.find(w => w.id === f1Id)!;
    const f2 = wps.find(w => w.id === f2Id)!;

    const v1x = f1.px - s.px, v1y = f1.py - s.py;
    const v2x = f2.px - s.px, v2y = f2.py - s.py;
    const cross = v1x * v2y - v1y * v2x;
    const sign = cross >= 0 ? 1 : -1; // preserve CW/CCW side

    const refAngle = Math.atan2(v1y, v1x);
    const dist2 = Math.hypot(v2x, v2y);
    const targetRad = targetDeg * Math.PI / 180;
    const newAngle = refAngle + sign * targetRad;

    pushHist();
    setWps(prev => prev.map(w =>
      w.id === f2Id
        ? { ...w, px: s.px + dist2 * Math.cos(newAngle), py: s.py + dist2 * Math.sin(newAngle) }
        : w
    ));

    // บันทึกเงื่อนไขล็อกมุม
    const lockId = `lock_${sharedId}_${f1Id}_${f2Id}`;
    const newLock: AngleLock = {
      id: lockId,
      sharedWpId: sharedId,
      wp1Id: f1Id,
      wp2Id: f2Id,
      deg: targetDeg
    };
    setAngleLocks(prev => [...prev.filter(l => l.id !== lockId), newLock]);

    setShowAngle(false);
    setRulerEdges([]);
  };

  /* ─── Remove Angle Lock handler ────────────────────── */
  const handleRemoveAngleLock = () => {
    if (rulerEdges.length !== 2) return;
    const e1 = eds[rulerEdges[0]], e2 = eds[rulerEdges[1]];
    const sharedId = findSharedWP(e1, e2);
    if (!sharedId) return;

    const f1Id = e1.from === sharedId ? e1.to : e1.from;
    const f2Id = e2.from === sharedId ? e2.to : e2.from;

    const lockId = `lock_${sharedId}_${f1Id}_${f2Id}`;
    const lockIdAlt = `lock_${sharedId}_${f2Id}_${f1Id}`;

    pushHist();
    setAngleLocks(prev => prev.filter(l => l.id !== lockId && l.id !== lockIdAlt));
    setShowAngle(false);
    setRulerEdges([]);
  };

  /* ─── Undo handler (for toolbar button) ────────────── */
  const handleUndo = () => {
    const snap = histRef.current.pop();
    if (snap) {
      setWps(snap.w);
      setEds(snap.e);
      setEdgeFrom(null);
      nextIdRef.current = snap.w.length > 0
        ? Math.max(...snap.w.map(w => parseInt(w.id.slice(1)))) + 1
        : 1;
    }
  };

  /* ─── JSX ──────────────────────────────────────────── */
  return (
    <div className="h-screen w-screen flex flex-col bg-slate-950 text-white select-none">
      {/* ── Top Bar ─────────────────────────────────── */}
      <div className="h-14 shrink-0 flex items-center justify-between px-4 border-b border-white/10 bg-slate-900/80 backdrop-blur-lg z-10">
        <button
          onClick={() => router.push("/dashboard/record")}
          className="flex items-center gap-2 text-sm text-slate-400 hover:text-white transition"
        >
          <ArrowLeft size={18} /> ย้อนกลับ
        </button>

        <span className="font-bold text-sm">
          ✏️ วาดเส้นทาง
        </span>

        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-300 rounded-lg text-xs font-semibold cursor-pointer transition">
            <Upload size={14} /> อัปโหลดแปลน
            <input type="file" accept=".pdf,image/*" className="hidden" onChange={handleUpload} />
          </label>
          <button
            onClick={() => {
              if (canSave) setShowSave(true);
              else alert("ต้องมี ≥ 2 จุด + ≥ 1 เส้น + ใส่ระยะอย่างน้อย 1 เส้น");
            }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition ${canSave
                ? "bg-purple-600 hover:bg-purple-500 text-white"
                : "bg-slate-800 text-slate-500 cursor-not-allowed"
              }`}
          >
            <Check size={14} /> บันทึก
          </button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* ── Toolbar ───────────────────────────────── */}
        <div className="w-12 shrink-0 flex flex-col items-center py-3 gap-1.5 border-r border-white/10 bg-slate-900/50">
          <ToolBtn icon={<Hand size={18} />} active={tool === "pan"} onClick={() => { setTool("pan"); setEdgeFrom(null); setRulerEdges([]); }} title="เลื่อนบอร์ด (Pan)" />
          <ToolBtn icon={<MapPin size={18} />} active={tool === "waypoint"} onClick={() => { setTool("waypoint"); setEdgeFrom(null); setRulerEdges([]); }} title="ปักจุด / ตั้งค่าจุด (Waypoint)" />
          <ToolBtn icon={<Pencil size={18} />} active={tool === "edge"} onClick={() => { setTool("edge"); setRulerEdges([]); }} title="เชื่อมเส้น / ใส่ระยะ (Edge)" />
          <ToolBtn icon={<DraftingCompass size={18} />} active={tool === "angle"} onClick={() => { setTool("angle"); setEdgeFrom(null); setRulerEdges([]); }} title="จัดระเบียบมุม (Angle)" />
          <ToolBtn icon={<Trash2 size={18} />} active={tool === "eraser"} onClick={() => { setTool("eraser"); setEdgeFrom(null); setRulerEdges([]); }} title="เครื่องมือลบ (Eraser)" danger />

          <div className="flex-1" />

          <ToolBtn icon={<ZoomIn size={18} />} onClick={() => setCam(c => ({ ...c, z: Math.min(5, c.z * 1.3) }))} title="ซูมเข้า" />
          <ToolBtn icon={<ZoomOut size={18} />} onClick={() => setCam(c => ({ ...c, z: Math.max(0.1, c.z / 1.3) }))} title="ซูมออก" />

          <div className="h-px w-8 bg-white/10 my-1" />

          <ToolBtn icon={<Undo2 size={18} />} onClick={handleUndo} title="Undo (Ctrl+Z)" />
          <ToolBtn
            icon={<Trash2 size={18} />}
            onClick={() => {
              if (selEdge !== null) {
                pushHist();
                const edgeToDelete = eds[selEdge];
                setEds(prev => prev.filter((_, i) => i !== selEdge));
                
                // ลบล็อกมุมที่ใช้ edge นี้
                setAngleLocks(prev => prev.filter(lock => {
                  const isEdge1 = (edgeToDelete.from === lock.sharedWpId && edgeToDelete.to === lock.wp1Id) || (edgeToDelete.to === lock.sharedWpId && edgeToDelete.from === lock.wp1Id);
                  const isEdge2 = (edgeToDelete.from === lock.sharedWpId && edgeToDelete.to === lock.wp2Id) || (edgeToDelete.to === lock.sharedWpId && edgeToDelete.from === lock.wp2Id);
                  return !isEdge1 && !isEdge2;
                }));
                setSelEdge(null);
              }
            }}
            title="ลบเส้นที่เลือก"
            danger
          />
        </div>

        {/* ── Canvas area ───────────────────────────── */}
        <div ref={wrapRef} className="flex-1 relative overflow-hidden">
          <canvas
            ref={canvasRef}
            className={`absolute inset-0 ${tool === "pan" ? "cursor-grab active:cursor-grabbing" : "cursor-crosshair"}`}
            onPointerDown={handleDown}
            onPointerMove={handleMove}
            onPointerUp={handleUp}
            onPointerLeave={() => setMousePos(null)}
          />

          {/* Empty state hint */}
          {wps.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="text-center text-slate-500">
                <p className="text-lg font-semibold mb-1">
                  คลิกเพื่อวาง Waypoint แรก หรือกดอัปโหลดแปลนด้านบน
                </p>
                <p className="text-sm">จุดแรกที่วาง = จุดเริ่มต้น AR (START)</p>
              </div>
            </div>
          )}

          {/* Edge-drawing indicator */}
          {edgeFrom && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-purple-600/80 backdrop-blur text-white text-xs font-semibold px-4 py-1.5 rounded-full pointer-events-none animate-pulse">
              คลิกจุดถัดไปเพื่อเชื่อมเส้น · Esc = ยกเลิก
            </div>
          )}

          {/* Status bar */}
          <div className="absolute bottom-3 left-3 flex gap-3 text-[10px] text-slate-500 pointer-events-none">
            <span>{wps.length} จุด</span>
            <span>{eds.length} เส้น</span>
            <span>zoom {(cam.z * 100).toFixed(0)}%</span>
            {ppm && <span className="text-green-400">✓ สเกล</span>}
          </div>

          {/* Hint: click edge to calibrate */}
          {wps.length >= 2 && eds.length >= 1 && !ppm && (
            <div className="absolute bottom-3 right-3 bg-amber-500/20 text-amber-300 text-xs font-semibold px-3 py-1.5 rounded-full pointer-events-none">
              📏 คลิกเส้นเพื่อใส่ระยะจริง (เมตร)
            </div>
          )}
        </div>
      </div>

      {/* ── Distance Modal ───────────────────────────── */}
      {showDist && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-6">
          <div className="bg-slate-800 rounded-2xl w-full max-w-xs p-5 shadow-2xl border border-white/10">
            <h3 className="text-lg font-bold mb-4">📏 ระยะจริง (เมตร)</h3>
            <input
              autoFocus
              type="number"
              step="0.1"
              min="0.1"
              value={distVal}
              onChange={e => setDistVal(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleDistSubmit()}
              placeholder="เช่น 10"
              style={{ boxSizing: "border-box" }}
              className="w-full bg-slate-700 border-2 border-transparent focus:border-purple-500 rounded-xl px-4 py-3 text-white text-lg font-mono outline-none transition mb-3"
            />
            <p className="text-xs text-slate-400 mb-4">
              ใส่ระยะจริงของเส้นนี้ → ทุกเส้นจะคำนวณอัตราส่วนให้อัตโนมัติ
            </p>
            <div className="flex gap-3">
              <button onClick={() => { setShowDist(false); setSelEdge(null); }} className="flex-1 py-2.5 bg-slate-700 hover:bg-slate-600 rounded-xl font-bold transition">
                ยกเลิก
              </button>
              <button onClick={handleDistSubmit} className="flex-1 py-2.5 bg-purple-600 hover:bg-purple-500 rounded-xl font-bold transition">
                ตกลง
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Save Modal ───────────────────────────────── */}
      {showSave && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md px-6">
          <div className="bg-white rounded-3xl w-full max-w-sm p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-slate-900">บันทึกแผนที่</h3>
              <button onClick={() => setShowSave(false)} className="p-2 rounded-full hover:bg-slate-100 text-slate-500 transition">
                <X size={20} />
              </button>
            </div>
            <div className="mb-4">
              <label className="block text-sm font-semibold text-slate-700 mb-2">ชื่อห้าง / สถานที่</label>
              <input
                autoFocus
                value={mapName}
                onChange={e => setMapName(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleSave()}
                placeholder="เช่น เซ็นทรัลลาดพร้าว"
                style={{ boxSizing: "border-box" }}
                className="w-full bg-slate-100 border-2 border-transparent rounded-xl px-4 py-3 text-slate-900 focus:outline-none focus:border-purple-500 transition font-medium text-lg"
              />
            </div>
            <div className="mb-6">
              <label className="block text-sm font-semibold text-slate-700 mb-2">รัศมีการเข้าใกล้จุด (เมตร)</label>
              <input
                type="number"
                step="0.1"
                min="0.1"
                value={proximityRadius}
                onChange={e => setProximityRadius(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleSave()}
                placeholder="เช่น 1.5"
                style={{ boxSizing: "border-box" }}
                className="w-full bg-slate-100 border-2 border-transparent rounded-xl px-4 py-3 text-slate-900 focus:outline-none focus:border-purple-500 transition font-medium text-lg font-mono"
              />
            </div>
            <div className="flex gap-3">
              <button onClick={() => setShowSave(false)} className="flex-1 py-3.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold transition">
                ยกเลิก
              </button>
              <button onClick={handleSave} disabled={saving} className="flex-1 py-3.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold transition disabled:opacity-50">
                {saving ? "รอสักครู่..." : "OK"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Waypoint Editor Modal ────────────────────── */}
      {showWpModal && selWpId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-6">
          <div className="bg-slate-800 rounded-2xl w-full max-w-xs p-5 shadow-2xl border border-white/10">
            <h3 className="text-lg font-bold mb-4 text-white font-sans">📍 ตั้งค่าจุด {selWpId}</h3>
            
            <div className="mb-3">
              <label className="block text-xs text-slate-400 mb-1 font-sans">ประเภทจุด</label>
              <select
                value={wpType}
                onChange={e => {
                  const val = e.target.value as any;
                  setWpType(val);
                  if (val === "qr_checkpoint" && wpHeading === "0") setWpHeading("0");
                }}
                style={{ boxSizing: "border-box" }}
                className="w-full bg-slate-700 text-white rounded-xl px-3 py-2 text-sm outline-none border border-slate-600 focus:border-purple-500 font-sans"
              >
                <option value="turn">จุดเลี้ยวทั่วไป (Turn)</option>
                <option value="destination">ร้านค้า / ปลายทาง (Destination)</option>
                <option value="qr_checkpoint">จุดสแกน QR (QR Checkpoint)</option>
              </select>
            </div>

            <div className="mb-3">
              <label className="block text-xs text-slate-400 mb-1 font-sans">ชื่อเรียก / ป้ายชื่อ (Label)</label>
              <input
                type="text"
                value={wpLabel}
                onChange={e => setWpLabel(e.target.value)}
                placeholder="เช่น Starbucks"
                style={{ boxSizing: "border-box" }}
                className="w-full bg-slate-700 text-white rounded-xl px-3 py-2 text-sm outline-none border border-slate-600 focus:border-purple-500 font-medium font-sans"
              />
            </div>

            {wpType === "qr_checkpoint" && (
              <div className="mb-4">
                <label className="block text-xs text-slate-400 mb-1 font-sans">ทิศทางเริ่มต้นของป้าย (องศา 0-360)</label>
                <input
                  type="number"
                  min="0"
                  max="360"
                  value={wpHeading}
                  onChange={e => setWpHeading(e.target.value)}
                  placeholder="เช่น 90"
                  style={{ boxSizing: "border-box" }}
                  className="w-full bg-slate-700 text-white rounded-xl px-3 py-2 text-sm outline-none border border-slate-600 focus:border-purple-500 font-mono"
                />
              </div>
            )}

            <div className="flex gap-3 mt-4">
              <button onClick={() => setShowWpModal(false)} className="flex-1 py-2.5 bg-slate-700 hover:bg-slate-600 rounded-xl text-sm font-bold transition font-sans">
                ยกเลิก
              </button>
              <button
                onClick={() => {
                  pushHist();
                  setWps(prev => prev.map(w =>
                    w.id === selWpId
                      ? {
                          ...w,
                          label: wpLabel.trim() || `จุดที่ ${parseInt(w.id.slice(1))}`,
                          type: wpType,
                          headingDeg: wpType === "qr_checkpoint" ? (parseFloat(wpHeading) || 0) : undefined
                        }
                      : w
                  ));
                  setShowWpModal(false);
                }}
                className="flex-1 py-2.5 bg-purple-600 hover:bg-purple-500 rounded-xl text-sm font-bold transition font-sans"
              >
                บันทึก
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Angle Modal ──────────────────────────────── */}
      {showAngle && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-6">
          <div className="bg-slate-800 rounded-2xl w-full max-w-xs p-5 shadow-2xl border border-white/10">
            <h3 className="text-lg font-bold mb-4 font-sans">📐 ปรับมุมระหว่างเส้น (องศา)</h3>
            <input
              autoFocus
              type="number"
              step="0.1"
              min="0.1"
              max="359.9"
              value={angleVal}
              onChange={e => setAngleVal(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleAngleSubmit()}
              placeholder="เช่น 90"
              style={{ boxSizing: "border-box" }}
              className="w-full bg-slate-700 border-2 border-transparent focus:border-amber-500 rounded-xl px-4 py-3 text-white text-lg font-mono outline-none transition mb-3"
            />
            <p className="text-xs text-slate-400 mb-4 font-sans">
              ระบบจะหมุนปลายเส้นที่ 2 ให้ได้มุมตามที่กำหนด
            </p>
            <div className="flex flex-col gap-2">
              <div className="flex gap-3">
                <button onClick={() => { setShowAngle(false); setRulerEdges([]); }} className="flex-1 py-2.5 bg-slate-700 hover:bg-slate-600 rounded-xl font-bold transition font-sans">
                  ยกเลิก
                </button>
                <button onClick={handleAngleSubmit} className="flex-1 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-900 rounded-xl font-bold transition font-sans">
                  ปรับมุม
                </button>
              </div>

              {/* ปุ่มลบเงื่อนไขล็อกมุม */}
              {angleLocks.some(l => {
                if (rulerEdges.length !== 2) return false;
                const e1 = eds[rulerEdges[0]], e2 = eds[rulerEdges[1]];
                const shared = findSharedWP(e1, e2);
                if (!shared) return false;
                const f1 = e1.from === shared ? e1.to : e1.from;
                const f2 = e2.from === shared ? e2.to : e2.from;
                return l.sharedWpId === shared && ((l.wp1Id === f1 && l.wp2Id === f2) || (l.wp1Id === f2 && l.wp2Id === f1));
              }) && (
                <button
                  onClick={handleRemoveAngleLock}
                  className="w-full py-2 bg-red-950/40 hover:bg-red-900/60 text-red-400 border border-red-900/40 rounded-xl text-xs font-semibold transition font-sans mt-1"
                >
                  🔓 ลบเงื่อนไขมุมของจุดนี้
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Toolbar button sub-component ───────────────────── */
function ToolBtn({ icon, active, onClick, title, danger }: {
  icon: React.ReactNode;
  active?: boolean;
  onClick: () => void;
  title: string;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`p-2 rounded-lg transition ${active
          ? "bg-purple-600 text-white"
          : danger
            ? "text-slate-400 hover:text-red-400 hover:bg-red-500/10"
            : "text-slate-400 hover:text-white hover:bg-white/10"
        }`}
    >
      {icon}
    </button>
  );
}
