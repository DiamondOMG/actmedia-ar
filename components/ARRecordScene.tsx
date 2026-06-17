"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { positionProvider } from "@/lib/position-provider";
import {
  Menu,
  MapPin,
  Check,
  X,
  LogOut
} from "lucide-react";
import * as THREE from "three";

declare const window: any;
declare const XR8: any;
declare const XRExtras: any;

let recordScene: THREE.Scene | null = null;

const initRecordPipelineModule = () => {
  const initXrScene = ({ scene, camera, renderer }: any) => {
    recordScene = scene;
    renderer.shadowMap.enabled = true;

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(5, 10, 7);
    directionalLight.castShadow = true;
    scene.add(directionalLight);

    // Origin marker
    const originMarker = new THREE.Mesh(
      new THREE.SphereGeometry(0.1, 16, 16),
      new THREE.MeshBasicMaterial({ color: 0x3b82f6 })
    );
    originMarker.position.set(0, 0.05, 0);
    scene.add(originMarker);

    camera.position.set(0, 1.6, 0);
  };

  return {
    name: "record-scene-init",
    onStart: ({ canvas }: any) => {
      const { scene, camera, renderer } = XR8.Threejs.xrScene();
      initXrScene({ scene, camera, renderer });
      canvas.addEventListener("touchmove", (e: Event) => e.preventDefault());
      XR8.XrController.updateCameraProjectionMatrix({
        origin: camera.position,
        facing: camera.quaternion,
      });
      canvas.addEventListener("touchstart", (e: TouchEvent) => {
        if (e.touches.length === 1) {
          XR8.XrController.recenter();
        }
      }, true);
    },
    onUpdate: () => {
      if (typeof XR8 === "undefined") return;
      const { camera } = XR8.Threejs.xrScene();
      if (!camera) return;
      positionProvider.updateFromSlam(camera.position, camera.quaternion);
    },
  };
};

type RecordState = "idle" | "countdown" | "recording" | "waiting_for_turn";

export default function ARRecordScene() {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);

  const [recState, setRecState] = useState<RecordState>("idle");
  const [countdown, setCountdown] = useState(3);
  const [showMenu, setShowMenu] = useState(false);

  const [waypoints, setWaypoints] = useState<Record<string, any>>({});
  const [edges, setEdges] = useState<[string, string][]>([]);
  const [wpCount, setWpCount] = useState(0);
  const [distanceToLast, setDistanceToLast] = useState(0);

  const [showSaveModal, setShowSaveModal] = useState(false);
  const [mapName, setMapName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [initial_heading_deg, set_initial_heading_deg] = useState(0);
  const [show_direction_modal, set_show_direction_modal] = useState(false);
  const [show_action_modal, set_show_action_modal] = useState(false);
  const [pending_turn_deg, set_pending_turn_deg] = useState(0);
  const [pending_turn_label, set_pending_turn_label] = useState("");

  const confirm_direction = (deg: number) => {
    set_initial_heading_deg(deg);
    set_show_direction_modal(false);
    startRecording();
  };

  // References for interval usage
  const recStateRef = useRef(recState);
  const wpCountRef = useRef(wpCount);
  const waypointsRef = useRef(waypoints);

  // Refs สำหรับวัดระยะทางแบบ Snapped Grid
  const leg_start_raw_pos_ref = useRef(new THREE.Vector3(0, 0, 0));
  const leg_start_waypoint_ref = useRef({ x: 0, z: 0 });
  const current_heading_deg_ref = useRef(0);

  useEffect(() => {
    recStateRef.current = recState;
    wpCountRef.current = wpCount;
    waypointsRef.current = waypoints;
  }, [recState, wpCount, waypoints]);

  useEffect(() => {
    let isMounted = true;
    recordScene = null;

    // รีเซ็ตทิศทางและสเกลเป็นค่าเริ่มต้นเสมอ
    positionProvider.setHeadingOffset(0);
    positionProvider.scaleFactor = 1.0;

    const startAR = () => {
      if (typeof window === "undefined") return;
      if (typeof XR8 === "undefined" || typeof XRExtras === "undefined") {
        setTimeout(startAR, 500);
        return;
      }
      if (!window.THREE) window.THREE = THREE;

      XR8.addCameraPipelineModules([
        XR8.GlTextureRenderer.pipelineModule(),
        XR8.Threejs.pipelineModule(),
        XR8.XrController.pipelineModule(),
        XRExtras.AlmostThere.pipelineModule(),
        XRExtras.FullWindowCanvas.pipelineModule(),
        XRExtras.RuntimeError.pipelineModule(),
        initRecordPipelineModule(),
      ]);
      XR8.run({ canvas: document.getElementById("camerafeed") as HTMLCanvasElement });
    };

    startAR();

    const interval = setInterval(() => {
      const is_rec = recStateRef.current === "recording" || recStateRef.current === "waiting_for_turn";
      if (is_rec && wpCountRef.current > 0) {
        const dist = positionProvider.position.distanceTo(leg_start_raw_pos_ref.current);
        setDistanceToLast(dist);
      }
    }, 150);

    return () => {
      isMounted = false;
      clearInterval(interval);
      if (typeof XR8 !== "undefined") {
        try {
          XR8.stop();
          XR8.clearCameraPipelineModules();
        } catch (e) {
          console.error(e);
        }
      }
    };
  }, []);

  const addMarker3D = (x: number, z: number) => {
    if (!recordScene) return;
    const geometry = new THREE.SphereGeometry(0.12, 16, 16);
    const material = new THREE.MeshBasicMaterial({ color: 0xa855f7 });
    const sphere = new THREE.Mesh(geometry, material);
    sphere.position.set(x, 0.12, z);
    recordScene.add(sphere);
  };

  const addLine3D = (x1: number, z1: number, x2: number, z2: number) => {
    if (!recordScene) return;
    const points = [
      new THREE.Vector3(x1, 0.08, z1),
      new THREE.Vector3(x2, 0.08, z2),
    ];
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({ color: 0xa855f7, linewidth: 3 });
    const line = new THREE.Line(geometry, material);
    recordScene.add(line);
  };

  const handle_add_first_waypoint = () => {
    const newCount = 1;
    const newId = `W${newCount}`;
    const newWp = {
      x: 0,
      z: 0,
      label: "จุดเริ่มต้น",
      type: "turn",
    };
    setWaypoints({ [newId]: newWp });
    addMarker3D(0, 0);
    setWpCount(newCount);
  };

  const handle_select_action = (action: string) => {
    set_show_action_modal(false);
    
    // 1. คำนวณระยะทางที่เดินจริงในใจจากกล้องเทียบกับจุดตั้งต้น Leg
    const dist = positionProvider.position.distanceTo(leg_start_raw_pos_ref.current);
    
    // 2. แตกพิกัดแบบ Snap ล็อคแกนมุมฉาก 90 องศาอิงตามเข็มกริดนำทาง
    const rad = THREE.MathUtils.degToRad(current_heading_deg_ref.current);
    const new_x = Number((leg_start_waypoint_ref.current.x + dist * Math.sin(rad)).toFixed(3));
    const new_z = Number((leg_start_waypoint_ref.current.z - dist * Math.cos(rad)).toFixed(3));
    
    const newCount = wpCountRef.current + 1;
    const newId = `W${newCount}`;
    const prevId = `W${wpCountRef.current}`;
    
    const newWp = {
      x: new_x,
      z: new_z,
      label: action === "straight" ? `จุดที่ ${newCount}` : `จุดเลี้ยวที่ ${newCount}`,
      type: "turn",
    };
    
    // บันทึกลงสถานะแผนที่
    setWaypoints(prev => ({ ...prev, [newId]: newWp }));
    setEdges(prev => [...prev, [prevId, newId]]);
    
    // วาดหมุดและเส้นเชื่อมสีม่วง
    addLine3D(leg_start_waypoint_ref.current.x, leg_start_waypoint_ref.current.z, new_x, new_z);
    addMarker3D(new_x, new_z);
    setWpCount(newCount);
    
    if (action === "straight") {
      // เดินตรงไปต่อ: ตั้งจุดอ้างอิงของ Leg ถัดไปจากตำแหน่งและจุดมาร์คล่าสุด
      leg_start_raw_pos_ref.current.copy(positionProvider.position);
      leg_start_waypoint_ref.current = newWp;
    } else {
      // เตรียมเลี้ยว: ค้างการบันทึกชั่วคราวและกำหนดข้อมูลมุมเลี้ยว
      let deg = 0;
      let label = "";
      if (action === "turn_right") { deg = 90; label = "ขวา"; }
      else if (action === "turn_left") { deg = -90; label = "ซ้าย"; }
      else if (action === "turn_back") { deg = 180; label = "หลัง"; }
      
      set_pending_turn_deg(deg);
      set_pending_turn_label(label);
      setRecState("waiting_for_turn");
      
      // ล็อคพิกัดมาร์คตัวเลี้ยวไว้ใช้คำนวณ Leg ถัดไป
      leg_start_waypoint_ref.current = newWp;
    }
  };

  const handle_confirm_turn_and_resume = () => {
    // 1. อัปเดตเข็มกริดนำทาง (ล็อคมุม 90 องศา)
    const new_deg = (current_heading_deg_ref.current + pending_turn_deg + 360) % 360;
    current_heading_deg_ref.current = new_deg;
    
    // 2. สั่งรีเซ็ตแกนกล้องใหม่ เพื่อให้นับทิศทางเดินตรงถัดไปจาก 0,0,0
    if (typeof XR8 !== "undefined") {
      XR8.XrController.recenter();
    }
    
    // 3. เริ่มต้นพิกัด Leg ใหม่หลังจากหันหน้าตรงตามทิศใหม่แล้ว
    leg_start_raw_pos_ref.current.set(0, 0, 0);
    
    set_pending_turn_deg(0);
    set_pending_turn_label("");
    setRecState("recording");
  };

  const startRecording = () => {
    setRecState("countdown");
    setCountdown(3);
    let count = 3;
    const iv = setInterval(() => {
      count--;
      if (count > 0) {
        setCountdown(count);
      } else {
        clearInterval(iv);
        
        // บังคับ Recentering เพื่อให้แกน Z หน้ากล้องมีค่าพิกัดเริ่มต้นเป็น 0 เสมอ
        if (typeof XR8 !== "undefined") {
          XR8.XrController.recenter();
        }
        
        current_heading_deg_ref.current = 0;
        leg_start_raw_pos_ref.current.set(0, 0, 0);
        leg_start_waypoint_ref.current = { x: 0, z: 0 };
        
        setRecState("recording");
        handle_add_first_waypoint(); // สร้างจุด W1 ที่ (0, 0)
      }
    }, 1000);
  };

  const handleSaveToDatabase = async () => {
    if (!mapName.trim()) {
      alert("กรุณากรอกชื่อห้าง");
      return;
    }
    setIsSubmitting(true);
    const mapId = `map_${Date.now()}`;

    // --- AUTO-GENERATE 5 DEFAULT DESTINATIONS ---
    const defaultStores = [
      { icon: "🏪", name: "ร้านค้า (Demo)", desc: "จุดแวะพัก" },
      { icon: "☕", name: "ร้านกาแฟ (Demo)", desc: "เครื่องดื่ม" },
      { icon: "👕", name: "ร้านเสื้อผ้า (Demo)", desc: "แฟชั่น" },
      { icon: "🚻", name: "ห้องน้ำ (Demo)", desc: "สิ่งอำนวยความสะดวก" },
      { icon: "🏁", name: "จุดหมาย (Demo)", desc: "ปลายทาง" },
    ];

    const generatedDestinations: any[] = [];
    const wpKeys = Object.keys(waypoints);
    // Exclude the starting point (W1) so we don't route to where we stand
    const availableWps = wpKeys.slice(1);

    // Copy waypoints to modify their types without mutating React state during save
    const finalWaypoints = JSON.parse(JSON.stringify(waypoints));

    if (availableWps.length > 0) {
      const numStores = Math.min(5, availableWps.length);
      for (let i = 0; i < numStores; i++) {
        // Spread destinations evenly across the available waypoints
        const index = Math.floor((i / Math.max(1, numStores - 1)) * (availableWps.length - 1));
        const wpId = availableWps[index];

        if (!generatedDestinations.some(d => d.waypoint === wpId)) {
          generatedDestinations.push({
            id: `dest_${wpId}`,
            name: defaultStores[i].name,
            waypoint: wpId,
            icon: defaultStores[i].icon,
            description: defaultStores[i].desc
          });
          finalWaypoints[wpId].type = "destination";
        }
      }
    }

    const payload = {
      id: mapId,
      name: mapName,
      floor: 1,
      initialHeadingDeg: initial_heading_deg,
      proximityRadiusM: 1.5,
      waypointsJson: JSON.stringify(finalWaypoints),
      edgesJson: JSON.stringify(edges),
      destinationsJson: JSON.stringify(generatedDestinations),
      comment: "",
    };

    try {
      const res = await fetch("/api/stores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("เกิดข้อผิดพลาดในการเซฟ");
      router.push("/dashboard");
    } catch (e: any) {
      alert("เซฟล้มเหลว กรุณาลองใหม่อีกครั้ง");
      setIsSubmitting(false);
    }
  };

  return (
    <div ref={containerRef} className="absolute inset-0 w-full h-full bg-black overflow-hidden font-sans">
      <canvas id="camerafeed" className="absolute inset-0 w-full h-full object-cover"></canvas>

      {/* Top Left: Distance */}
      {recState === "recording" && (
        <div className="absolute top-6 left-6 z-40">
          <div className="bg-black/40 backdrop-blur-md px-4 py-2 rounded-full border border-white/20 text-white shadow-lg">
            <div className="text-[10px] text-gray-300 font-semibold uppercase tracking-wider">ระยะทาง (m)</div>
            <div className="text-2xl font-bold font-mono">{distanceToLast.toFixed(2)}</div>
          </div>
        </div>
      )}

      {/* Top Right: Hamburger Menu */}
      <div className="absolute top-6 right-6 z-50">
        <button
          onClick={() => setShowMenu(!showMenu)}
          className="bg-black/40 backdrop-blur-md p-3 rounded-full border border-white/20 text-white shadow-lg active:scale-95 transition-transform"
        >
          <Menu size={24} />
        </button>
        {showMenu && (
          <div className="absolute top-14 right-0 mt-2 w-48 bg-slate-900/90 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in slide-in-from-top-2">
            <button
              onClick={() => router.push("/dashboard")}
              className="w-full text-left px-4 py-4 text-white hover:bg-white/10 flex items-center gap-3 transition-colors"
            >
              <LogOut size={18} className="text-red-400" />
              <span className="font-semibold text-sm">ออกจากโหมดบันทึก</span>
            </button>
          </div>
        )}
      </div>

      {/* Center Screen: Countdown */}
      {recState === "countdown" && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/20 backdrop-blur-sm">
          <div className="text-[120px] font-bold text-white drop-shadow-[0_0_20px_rgba(255,255,255,0.8)] animate-pulse">
            {countdown}
          </div>
        </div>
      )}

      {/* Bottom Controls */}
      <div className="absolute bottom-10 left-0 right-0 z-40 px-8">

        {recState === "idle" && (
          <div className="flex justify-center animate-in slide-in-from-bottom-10 fade-in duration-500">
            <button
              onClick={() => set_show_direction_modal(true)}
              className="w-20 h-20 bg-red-500 rounded-full border-4 border-white shadow-[0_0_25px_rgba(239,68,68,0.6)] active:scale-90 transition-all flex items-center justify-center relative"
            >
              <div className="absolute inset-0 rounded-full border border-white/50 animate-ping"></div>
            </button>
          </div>
        )}

        {recState === "recording" && (
          <div className="flex items-center justify-between animate-in slide-in-from-bottom-10 fade-in duration-300">
            {/* Spacer for flex balance */}
            <div className="w-16 h-16"></div>

            {/* Checkpoint Button (Center) */}
            <button
              onClick={() => set_show_action_modal(true)}
              className="w-20 h-20 bg-purple-600 rounded-full border-4 border-white shadow-[0_0_20px_rgba(168,85,247,0.5)] active:scale-90 transition-all flex flex-col items-center justify-center text-white"
            >
              <MapPin size={28} />
            </button>

            {/* Complete Button (Right) */}
            <button
              onClick={() => {
                if (wpCount < 2) {
                  alert("กรุณาบันทึก Checkpoint อย่างน้อย 1 จุดหลังจากจุดเริ่มต้น");
                  return;
                }
                setShowSaveModal(true);
              }}
              className="w-16 h-16 bg-white rounded-full shadow-xl active:scale-90 transition-all flex items-center justify-center text-slate-900 border-2 border-slate-200"
            >
              <Check size={28} />
            </button>
          </div>
        )}
      </div>

      {/* Save Modal */}
      {showSaveModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-md px-6">
          <div className="bg-white rounded-3xl w-full max-w-sm p-6 shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-slate-900">บันทึกเส้นทาง</h3>
              <button
                onClick={() => setShowSaveModal(false)}
                className="p-2 rounded-full hover:bg-slate-100 text-slate-500 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <div className="mb-6">
              <label className="block text-sm font-semibold text-slate-700 mb-2">ชื่อห้าง / สถานที่</label>
              <input
                type="text"
                autoFocus
                value={mapName}
                onChange={(e) => setMapName(e.target.value)}
                placeholder="เช่น เซ็นทรัลลาดพร้าว"
                className="w-full bg-slate-100 border-2 border-transparent rounded-xl px-4 py-3 text-slate-900 focus:outline-none focus:border-purple-500 transition-colors font-medium text-lg"
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowSaveModal(false)}
                className="flex-1 py-3.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold transition-colors"
              >
                ยกเลิก
              </button>
              <button
                onClick={handleSaveToDatabase}
                disabled={isSubmitting}
                className="flex-1 py-3.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold transition-colors disabled:opacity-50"
              >
                {isSubmitting ? "รอสักครู่..." : "OK"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Direction Selection Modal */}
      {show_direction_modal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-md px-6 font-sans">
          <div className="bg-slate-900 border border-white/10 rounded-3xl w-full max-w-sm p-6 shadow-2xl animate-in zoom-in-95 duration-200 text-white">
            <h3 className="text-xl font-bold mb-2">เลือกทิศทางเริ่มต้น 🗺️</h3>
            <p className="text-sm text-slate-400 mb-6 font-medium">
              เลือกทิศทางที่ต้องการให้ลูกศรชี้ไปตอนเริ่มต้นนำทาง (เทียบกับหน้าป้าย QR Code)
            </p>

            <div className="grid grid-cols-2 gap-3 mb-6 font-bold">
              <button
                onClick={() => confirm_direction(0)}
                className="py-4 px-3 rounded-2xl bg-slate-800 hover:bg-purple-600 border border-white/5 active:scale-95 transition-all text-center flex flex-col items-center justify-center gap-2"
              >
                <span className="text-2xl">⬆️</span>
                <span className="text-sm">ตรงไป (0°)</span>
              </button>
              <button
                onClick={() => confirm_direction(90)}
                className="py-4 px-3 rounded-2xl bg-slate-800 hover:bg-purple-600 border border-white/5 active:scale-95 transition-all text-center flex flex-col items-center justify-center gap-2"
              >
                <span className="text-2xl">➡️</span>
                <span className="text-sm">เลี้ยวขวา (90°)</span>
              </button>
              <button
                onClick={() => confirm_direction(-90)}
                className="py-4 px-3 rounded-2xl bg-slate-800 hover:bg-purple-600 border border-white/5 active:scale-95 transition-all text-center flex flex-col items-center justify-center gap-2"
              >
                <span className="text-2xl">⬅️</span>
                <span className="text-sm">เลี้ยวซ้าย (-90°)</span>
              </button>
              <button
                onClick={() => confirm_direction(180)}
                className="py-4 px-3 rounded-2xl bg-slate-800 hover:bg-purple-600 border border-white/5 active:scale-95 transition-all text-center flex flex-col items-center justify-center gap-2"
              >
                <span className="text-2xl">⬇️</span>
                <span className="text-sm">กลับหลัง (180°)</span>
              </button>
            </div>

            <button
              onClick={() => set_show_direction_modal(false)}
              className="w-full py-3.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold transition-all text-sm"
            >
              ยกเลิก
            </button>
          </div>
        </div>
      )}

      {/* Action Selection Modal */}
      {show_action_modal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-md px-6 font-sans">
          <div className="bg-slate-900 border border-white/10 rounded-3xl w-full max-w-sm p-6 shadow-2xl animate-in zoom-in-95 duration-200 text-white">
            <h3 className="text-xl font-bold mb-2">มาร์คจุดนำทาง 📌</h3>
            <p className="text-sm text-slate-400 mb-6 font-medium">
              เลือกทิศทางการเดินถัดไปของคุณจากจุดนี้
            </p>

            <div className="grid grid-cols-1 gap-3 mb-6 font-bold">
              <button
                onClick={() => handle_select_action("straight")}
                className="py-3.5 px-4 rounded-2xl bg-slate-800 hover:bg-purple-600 border border-white/5 active:scale-95 transition-all text-left flex items-center gap-3"
              >
                <span className="text-2xl">⬆️</span>
                <div>
                  <div className="text-sm">เดินตรงไปต่อ (บันทึกจุดตรง)</div>
                  <div className="text-[10px] text-slate-400 font-normal">มาร์คจุดอ้างอิงตรงทางยาว</div>
                </div>
              </button>
              <button
                onClick={() => handle_select_action("turn_right")}
                className="py-3.5 px-4 rounded-2xl bg-slate-800 hover:bg-purple-600 border border-white/5 active:scale-95 transition-all text-left flex items-center gap-3"
              >
                <span className="text-2xl">➡️</span>
                <div>
                  <div className="text-sm">เลี้ยวขวา (90°)</div>
                  <div className="text-[10px] text-slate-400 font-normal">บันทึกจุดเลี้ยวและกดยืนยันการเลี้ยว</div>
                </div>
              </button>
              <button
                onClick={() => handle_select_action("turn_left")}
                className="py-3.5 px-4 rounded-2xl bg-slate-800 hover:bg-purple-600 border border-white/5 active:scale-95 transition-all text-left flex items-center gap-3"
              >
                <span className="text-2xl">⬅️</span>
                <div>
                  <div className="text-sm">เลี้ยวซ้าย (-90°)</div>
                  <div className="text-[10px] text-slate-400 font-normal">บันทึกจุดเลี้ยวและกดยืนยันการเลี้ยว</div>
                </div>
              </button>
              <button
                onClick={() => handle_select_action("turn_back")}
                className="py-3.5 px-4 rounded-2xl bg-slate-800 hover:bg-purple-600 border border-white/5 active:scale-95 transition-all text-left flex items-center gap-3"
              >
                <span className="text-2xl">⬇️</span>
                <div>
                  <div className="text-sm">กลับหลัง (180°)</div>
                  <div className="text-[10px] text-slate-400 font-normal">บันทึกจุดเลี้ยวและหันกลับหลังหัน</div>
                </div>
              </button>
            </div>

            <button
              onClick={() => set_show_action_modal(false)}
              className="w-full py-3.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold transition-all text-sm"
            >
              ยกเลิก
            </button>
          </div>
        </div>
      )}

      {/* Turn Confirmation Panel */}
      {recState === "waiting_for_turn" && (
        <div className="absolute inset-x-6 bottom-10 z-[80] font-sans">
          <div className="bg-slate-900/90 border border-purple-500/30 rounded-3xl p-5 text-center shadow-2xl backdrop-blur-md animate-in slide-in-from-bottom-10 fade-in duration-300">
            <div className="text-3xl mb-2">🔄</div>
            <h4 className="text-lg font-bold text-white mb-1">กรุณาเลี้ยวเครื่องไปทาง {pending_turn_label}</h4>
            <p className="text-xs text-slate-400 mb-4 font-medium">
              หันหน้ากล้องให้ขนานกับแนวทางเดินใหม่ตรงๆ แล้วกดยืนยัน
            </p>
            <button
              onClick={handle_confirm_turn_and_resume}
              className="w-full py-3.5 rounded-2xl bg-purple-600 hover:bg-purple-700 text-white font-bold transition-all text-sm shadow-lg shadow-purple-500/25 active:scale-95"
            >
              เริ่มเดินตรงต่อ ➡️
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

