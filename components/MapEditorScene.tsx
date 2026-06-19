"use client";

// ponytail: single-file canvas editor, split when it hurts
// ponytail: no pinch-zoom / touch gestures yet — desktop-first editor
//           upgrade path: add pointer event multi-touch handling

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, Pencil, Hand, Undo2, Trash2,
  Upload, Check, X, ZoomIn, ZoomOut,
} from "lucide-react";

/* ─── Types ──────────────────────────────────────────── */
interface WP { id: string; px: number; py: number; label: string }
interface Ed { from: string; to: string; meters?: number }
type Tool = "draw" | "pan";

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

/* ─── Component ──────────────────────────────────────── */
export default function MapEditorScene({ mode }: { mode: "draw" | "blueprint" }) {
  const router = useRouter();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Core data
  const [wps, setWps] = useState<WP[]>([]);
  const [eds, setEds] = useState<Ed[]>([]);
  const nextIdRef = useRef(1);

  // Interaction
  const [tool, setTool] = useState<Tool>("draw");
  const [edgeFrom, setEdgeFrom] = useState<string | null>(null);
  const [selEdge, setSelEdge] = useState<number | null>(null);

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

  // Undo history
  const histRef = useRef<{ w: WP[]; e: Ed[] }[]>([]);

  // Mouse position for edge preview
  const mouseRef = useRef<{ x: number; y: number } | null>(null);
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
      const cal = e.meters != null;

      ctx.beginPath();
      ctx.moveTo(a.px, a.py);
      ctx.lineTo(b.px, b.py);
      ctx.strokeStyle = sel ? "#f59e0b" : cal ? "#22c55e" : "#8b5cf6";
      ctx.lineWidth = (sel ? 4 : 2.5) / cam.z;
      ctx.stroke();

      // Distance label
      const pxDist = Math.hypot(b.px - a.px, b.py - a.py);
      let label = "";
      if (cal) label = `${e.meters} m ★`;
      else if (ppm) label = `${(pxDist / ppm).toFixed(1)} m`;

      if (label) {
        const fs = Math.max(10, 13 / cam.z);
        ctx.font = `bold ${fs}px sans-serif`;
        ctx.fillStyle = cal ? "#22c55e" : "#c4b5fd";
        ctx.textAlign = "center";
        ctx.fillText(label, (a.px + b.px) / 2, (a.py + b.py) / 2 - 10 / cam.z);
      }
    });

    // Edge preview (dashed line following mouse)
    if (edgeFrom && mouseRef.current) {
      const a = wps.find(w => w.id === edgeFrom);
      if (a) {
        ctx.beginPath();
        ctx.moveTo(a.px, a.py);
        ctx.lineTo(mouseRef.current.x, mouseRef.current.y);
        ctx.strokeStyle = "rgba(168,85,247,0.5)";
        ctx.lineWidth = 2 / cam.z;
        ctx.setLineDash([6 / cam.z, 4 / cam.z]);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // Waypoints
    wps.forEach((wp, i) => {
      const r = WP_R / cam.z;
      const first = i === 0;

      ctx.beginPath();
      ctx.arc(wp.px, wp.py, r, 0, Math.PI * 2);
      ctx.fillStyle = first ? "#3b82f6" : "#a855f7";
      ctx.fill();
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 2 / cam.z;
      ctx.stroke();

      // ID label
      const fs = Math.max(9, 11 / cam.z);
      ctx.font = `bold ${fs}px sans-serif`;
      ctx.fillStyle = "#fff";
      ctx.textAlign = "center";
      ctx.fillText(wp.id, wp.px, wp.py - r - 4 / cam.z);

      if (first) {
        ctx.fillStyle = "#93c5fd";
        ctx.fillText("START", wp.px, wp.py + r + fs + 2 / cam.z);
      }
    });

    ctx.restore();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wps, eds, cam, bg, selEdge, edgeFrom, ppm, tick]);

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
      if (e.ctrlKey && e.key === "z") {
        e.preventDefault();
        const snap = histRef.current.pop();
        if (snap) {
          setWps(snap.w);
          setEds(snap.e);
          setEdgeFrom(null);
          nextIdRef.current = snap.w.length > 0
            ? Math.max(...snap.w.map(w => parseInt(w.id.slice(1)))) + 1
            : 1;
        }
      }
      if (e.key === "Escape") { setEdgeFrom(null); setSelEdge(null); }
      if ((e.key === "Delete" || e.key === "Backspace") && selEdge !== null) {
        setEds(prev => prev.filter((_, i) => i !== selEdge));
        setSelEdge(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selEdge]);

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

    // Pan mode: always pan
    if (tool === "pan") {
      panRef.current = { active: true, sx: e.clientX, sy: e.clientY, cx: cam.x, cy: cam.y, moved: false };
      return;
    }

    // Draw mode: check what's under cursor
    const wp = hitWP(w.x, w.y);
    if (wp) {
      if (edgeFrom) {
        // Complete edge (or cancel if same WP / duplicate)
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

    // Empty space → start pan tracking (will decide click vs drag in up)
    panRef.current = { active: true, sx: e.clientX, sy: e.clientY, cx: cam.x, cy: cam.y, moved: false };
  };

  /* ─── Pointer move ─────────────────────────────────── */
  const handleMove = (e: React.PointerEvent) => {
    const w = getWorld(e);
    mouseRef.current = w;

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

    if (edgeFrom) setTick(t => t + 1); // re-render preview line
  };

  /* ─── Pointer up ───────────────────────────────────── */
  const handleUp = (e: React.PointerEvent) => {
    canvasRef.current?.releasePointerCapture(e.pointerId);

    if (panRef.current.active) {
      const wasDrag = panRef.current.moved;
      panRef.current = { active: false, sx: 0, sy: 0, cx: 0, cy: 0, moved: false };

      if (!wasDrag && tool === "draw") {
        const w = getWorld(e);

        if (edgeFrom) {
          // Place new WP + auto-connect + continue chain
          const id = `W${nextIdRef.current}`;
          nextIdRef.current++;
          pushHist();
          setWps(prev => [...prev, { id, px: w.x, py: w.y, label: `จุดที่ ${parseInt(id.slice(1))}` }]);
          setEds(prev => [...prev, { from: edgeFrom!, to: id }]);
          setEdgeFrom(id); // continue chain
        } else {
          // Place standalone WP
          const id = `W${nextIdRef.current}`;
          nextIdRef.current++;
          pushHist();
          setWps(prev => [...prev, { id, px: w.x, py: w.y, label: `จุดที่ ${parseInt(id.slice(1))}` }]);
        }
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
    const a = wps.find(w => w.id === e.from);
    const b = wps.find(w => w.id === e.to);
    if (!a || !b) return;

    const newPpm = Math.hypot(b.px - a.px, b.py - a.py) / m;
    setEds(prev => prev.map((ed, i) => i === selEdge ? { ...ed, meters: m } : ed));
    setPpm(newPpm);
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
        type: "turn",
      };
    });

    const edgeArr = eds.map(e => [e.from, e.to]);

    // Auto-gen demo destinations (same logic as ARRecordScene)
    const demo = [
      { icon: "🏪", name: "ร้านค้า (Demo)", desc: "จุดแวะพัก" },
      { icon: "☕", name: "ร้านกาแฟ (Demo)", desc: "เครื่องดื่ม" },
      { icon: "👕", name: "ร้านเสื้อผ้า (Demo)", desc: "แฟชั่น" },
      { icon: "🚻", name: "ห้องน้ำ (Demo)", desc: "สิ่งอำนวยความสะดวก" },
      { icon: "🏁", name: "จุดหมาย (Demo)", desc: "ปลายทาง" },
    ];
    const avail = Object.keys(wpObj).slice(1);
    const dests: any[] = [];
    const n = Math.min(5, avail.length);
    for (let i = 0; i < n; i++) {
      const idx = Math.floor((i / Math.max(1, n - 1)) * (avail.length - 1));
      const wid = avail[idx];
      if (!dests.some(d => d.waypoint === wid)) {
        dests.push({ id: `dest_${wid}`, name: demo[i].name, waypoint: wid, icon: demo[i].icon, description: demo[i].desc });
        wpObj[wid].type = "destination";
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
          proximityRadiusM: 1.5,
          waypointsJson: JSON.stringify(wpObj),
          edgesJson: JSON.stringify(edgeArr),
          destinationsJson: JSON.stringify(dests),
          comment: `สร้างจากโหมด ${mode === "blueprint" ? "Blueprint" : "Draw"}`,
        }),
      });
      if (!res.ok) throw new Error();
      router.push("/dashboard");
    } catch {
      alert("เซฟล้มเหลว กรุณาลองใหม่");
      setSaving(false);
    }
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
          {mode === "blueprint" ? "📄 Blueprint" : "✏️ วาดเส้นทาง"}
        </span>

        <div className="flex items-center gap-2">
          {mode === "blueprint" && (
            <label className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-300 rounded-lg text-xs font-semibold cursor-pointer transition">
              <Upload size={14} /> อัปโหลด
              <input type="file" accept=".pdf,image/*" className="hidden" onChange={handleUpload} />
            </label>
          )}
          <button
            onClick={() => {
              if (canSave) setShowSave(true);
              else alert("ต้องมี ≥ 2 จุด + ≥ 1 เส้น + ใส่ระยะอย่างน้อย 1 เส้น");
            }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition ${
              canSave
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
          <ToolBtn icon={<Pencil size={18} />} active={tool === "draw"} onClick={() => setTool("draw")} title="วาด" />
          <ToolBtn icon={<Hand size={18} />} active={tool === "pan"} onClick={() => { setTool("pan"); setEdgeFrom(null); }} title="เลื่อน" />

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
                setEds(prev => prev.filter((_, i) => i !== selEdge));
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
          />

          {/* Empty state hint */}
          {wps.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="text-center text-slate-500">
                <p className="text-lg font-semibold mb-1">
                  {mode === "blueprint" ? "อัปโหลดแปลนก่อน แล้วคลิกวาง Waypoint" : "คลิกเพื่อวาง Waypoint แรก"}
                </p>
                <p className="text-sm">จุดแรก = จุดเริ่มต้น AR (START)</p>
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
            <div className="mb-6">
              <label className="block text-sm font-semibold text-slate-700 mb-2">ชื่อห้าง / สถานที่</label>
              <input
                autoFocus
                value={mapName}
                onChange={e => setMapName(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleSave()}
                placeholder="เช่น เซ็นทรัลลาดพร้าว"
                className="w-full bg-slate-100 border-2 border-transparent rounded-xl px-4 py-3 text-slate-900 focus:outline-none focus:border-purple-500 transition font-medium text-lg"
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
      className={`p-2 rounded-lg transition ${
        active
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
