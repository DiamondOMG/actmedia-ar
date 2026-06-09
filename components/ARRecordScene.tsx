"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { positionProvider } from "../lib/position-provider";
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

type RecordState = "idle" | "countdown" | "recording";

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

  // References for interval usage
  const recStateRef = useRef(recState);
  const wpCountRef = useRef(wpCount);
  const waypointsRef = useRef(waypoints);

  useEffect(() => {
    recStateRef.current = recState;
    wpCountRef.current = wpCount;
    waypointsRef.current = waypoints;
  }, [recState, wpCount, waypoints]);

  useEffect(() => {
    let isMounted = true;
    recordScene = null;

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
      if (recStateRef.current === "recording" && wpCountRef.current > 0) {
        const lastWp = waypointsRef.current[`W${wpCountRef.current}`];
        if (lastWp) {
          const currentPos = positionProvider.position;
          const lastVec = new THREE.Vector3(lastWp.x, currentPos.y, lastWp.z);
          const dist = currentPos.distanceTo(lastVec);
          setDistanceToLast(dist);
        }
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

  const handleAddWaypoint = () => {
    const pos = positionProvider.position.clone();
    const newCount = wpCountRef.current + 1;
    const newId = `W${newCount}`;
    
    const newWp = {
      x: Number(pos.x.toFixed(3)),
      z: Number(pos.z.toFixed(3)),
      label: `จุดที่ ${newCount}`,
      type: "turn",
    };

    setWaypoints(prev => ({ ...prev, [newId]: newWp }));

    if (newCount > 1) {
      const prevId = `W${newCount - 1}`;
      const prevWp = waypointsRef.current[prevId];
      if (prevWp) {
        setEdges(prev => [...prev, [prevId, newId]]);
        addLine3D(prevWp.x, prevWp.z, newWp.x, newWp.z);
      }
    }

    addMarker3D(newWp.x, newWp.z);
    setWpCount(newCount);
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
        setRecState("recording");
        handleAddWaypoint(); // Auto add starting point
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
      initialHeadingDeg: 0,
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
              onClick={startRecording}
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
              onClick={handleAddWaypoint}
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
    </div>
  );
}

