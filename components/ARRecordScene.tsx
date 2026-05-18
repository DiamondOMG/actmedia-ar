"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { positionProvider } from "../lib/position-provider";
import { 
  Plus, 
  MapPin, 
  Store, 
  Save, 
  X, 
  ArrowLeft, 
  Trash2,
  CheckCircle,
  HelpCircle
} from "lucide-react";
import * as THREE from "three";

declare const window: any;
declare const XR8: any;
declare const XRExtras: any;

let recordScene: THREE.Scene | null = null;

// Pipeline Module สำหรับ 8th Wall ในโหมดบันทึกแผนที่
const initRecordPipelineModule = () => {
  const clock = new THREE.Clock();

  const initXrScene = ({ scene, camera, renderer }: any) => {
    recordScene = scene;
    renderer.shadowMap.enabled = true;

    // แสงสว่าง
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(5, 10, 7);
    directionalLight.castShadow = true;
    scene.add(directionalLight);

    // มาร์กเกอร์จุดเริ่มต้น (0,0,0)
    const originMarker = new THREE.Mesh(
      new THREE.SphereGeometry(0.1, 16, 16),
      new THREE.MeshBasicMaterial({ color: 0x3b82f6 }) // สีน้ำเงินจุดสตาร์ท
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

      // อัปเดตพิกัด SLAM ปัจจุบันของกล้องเข้าไปใน PositionProvider
      positionProvider.updateFromSlam(camera.position, camera.quaternion);
    },
  };
};

export default function ARRecordScene() {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  
  const [xrStarted, setXrStarted] = useState(false);
  const [waypoints, setWaypoints] = useState<Record<string, any>>({});
  const [edges, setEdges] = useState<[string, string][]>([]);
  const [destinations, setDestinations] = useState<any[]>([]);
  const [wpCount, setWpCount] = useState(0);

  // States สำหรับกล่องเซฟแผนที่
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [mapName, setMapName] = useState("");
  const [floor, setFloor] = useState(1);
  const [comment, setComment] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const [currentPosStr, setCurrentPosStr] = useState("(0.00, 0.00)");

  // เริ่มต้นเปิดระบบกล้อง 8th Wall
  useEffect(() => {
    let isMounted = true;
    recordScene = null; // reset scene ref

    const startAR = () => {
      if (typeof window === "undefined") return;
      if (typeof XR8 === "undefined" || typeof XRExtras === "undefined") {
        setTimeout(startAR, 500);
        return;
      }

      if (!window.THREE) {
        window.THREE = THREE;
      }

      if (isMounted) setXrStarted(true);

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

    // คอยอัปเดตค่าพิกัดปัจจุบันบนหน้าจอให้เห็นแบบ Real-time
    const interval = setInterval(() => {
      const pos = positionProvider.position;
      setCurrentPosStr(`(${pos.x.toFixed(2)}, ${pos.z.toFixed(2)})`);
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

  // วาด Marker ทรงกลมใน 3D Scene
  const addMarker3D = (x: number, z: number, isDest: boolean) => {
    if (!recordScene) return;
    
    // ลูกบอลพิกัด
    const geometry = new THREE.SphereGeometry(0.12, 16, 16);
    const material = new THREE.MeshBasicMaterial({
      color: isDest ? 0x22c55e : 0xa855f7, // สีเขียวถ้าเป็นร้านค้า, สีม่วงถ้าเป็นจุดเชื่อมเส้นทาง
    });
    const sphere = new THREE.Mesh(geometry, material);
    sphere.position.set(x, 0.12, z);
    recordScene.add(sphere);
  };

  // วาดเส้นเชื่อมใน 3D Scene
  const addLine3D = (x1: number, z1: number, x2: number, z2: number) => {
    if (!recordScene) return;

    const points = [
      new THREE.Vector3(x1, 0.08, z1),
      new THREE.Vector3(x2, 0.08, z2),
    ];
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({
      color: 0xa855f7, // สีม่วงนีออน
      linewidth: 3,
    });
    const line = new THREE.Line(geometry, material);
    recordScene.add(line);
  };

  // ฟังก์ชันปักหมุด Waypoint ปกติ (สำหรับเส้นทางเลี้ยว/ทางเดินยาว)
  const handleAddWaypoint = () => {
    const pos = positionProvider.position.clone();
    const newId = `W${wpCount + 1}`;
    
    const newWp = {
      x: Number(pos.x.toFixed(3)),
      z: Number(pos.z.toFixed(3)),
      label: `จุดเลี้ยวที่ ${wpCount + 1}`,
      type: "turn",
    };

    setWaypoints(prev => ({
      ...prev,
      [newId]: newWp
    }));

    // ถ้ามีจุดก่อนหน้า ให้เชื่อมเส้นทาง (Edge) อัตโนมัติทันที
    if (wpCount > 0) {
      const prevId = `W${wpCount}`;
      const prevWp = waypoints[prevId];
      if (prevWp) {
        setEdges(prev => [...prev, [prevId, newId]]);
        addLine3D(prevWp.x, prevWp.z, newWp.x, newWp.z);
      }
    }

    addMarker3D(newWp.x, newWp.z, false);
    setWpCount(prev => prev + 1);
  };

  // ฟังก์ชันปักหมุดพร้อมตั้งเป็น Destination (ร้านค้า/ห้องน้ำ/จุดหมาย)
  const handleAddDestination = () => {
    const pos = positionProvider.position.clone();
    const newId = `W${wpCount + 1}`;
    
    const newWp = {
      x: Number(pos.x.toFixed(3)),
      z: Number(pos.z.toFixed(3)),
      label: `จุดหมายที่ ${wpCount + 1}`,
      type: "destination",
    };

    setWaypoints(prev => ({
      ...prev,
      [newId]: newWp
    }));

    // เชื่อมเส้นทางจากจุดก่อนหน้า
    if (wpCount > 0) {
      const prevId = `W${wpCount}`;
      const prevWp = waypoints[prevId];
      if (prevWp) {
        setEdges(prev => [...prev, [prevId, newId]]);
        addLine3D(prevWp.x, prevWp.z, newWp.x, newWp.z);
      }
    }

    // เพิ่มในรายการจุดหมายเตรียมเซฟ
    const newDest = {
      id: newId,
      name: `ร้านค้าใหม่ ${destinations.length + 1}`,
      waypoint: newId,
      icon: "🏪",
      description: "ใส่รายละเอียดที่นี่",
    };

    setDestinations(prev => [...prev, newDest]);

    addMarker3D(newWp.x, newWp.z, true);
    setWpCount(prev => prev + 1);
  };

  // อัปเดตข้อมูลรายละเอียดร้านค้าปลายทางใน Modal
  const handleUpdateDestField = (index: number, field: string, value: any) => {
    setDestinations(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  // ลบร้านค้าออกจากเป้าหมาย (แต่ยังคงเป็น Waypoint ในกราฟเส้นทาง)
  const handleRemoveDestination = (index: number) => {
    setDestinations(prev => prev.filter((_, i) => i !== index));
  };

  // บันทึกแผนที่ลงใน Turso DB ผ่าน API
  const handleSaveToDatabase = async () => {
    if (!mapName.trim()) {
      setErrorMsg("กรุณากรอกชื่อแผนที่");
      return;
    }

    if (wpCount < 2) {
      setErrorMsg("ต้องมีจุด Waypoint อย่างน้อย 2 จุดเพื่อสร้างแผนที่");
      return;
    }

    setIsSubmitting(true);
    setErrorMsg("");

    const mapId = `map_${Date.now()}`;

    const payload = {
      id: mapId,
      name: mapName,
      floor: Number(floor),
      initialHeadingDeg: 0,
      proximityRadiusM: 2.5,
      waypointsJson: JSON.stringify(waypoints),
      edgesJson: JSON.stringify(edges),
      destinationsJson: JSON.stringify(destinations),
      comment: comment,
    };

    try {
      const res = await fetch("/api/stores", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "เกิดข้อผิดพลาดในการเซฟ");
      }

      // เซฟเสร็จแล้ว redirect กลับ dashboard
      router.push("/dashboard");
    } catch (e: any) {
      setErrorMsg(e.message || "เซฟแผนที่ล้มเหลว กรุณาลองใหม่อีกครั้ง");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div ref={containerRef} className="absolute inset-0 w-full h-full bg-black overflow-hidden font-sans">
      <canvas id="camerafeed"></canvas>

      {/* ลิงก์ย้อนกลับ (ปิดกล้อง) */}
      <button 
        onClick={() => router.push("/dashboard")}
        className="absolute top-4 left-4 z-50 bg-black/60 backdrop-blur-md px-4 py-2.5 rounded-full text-white border border-white/10 shadow-lg flex items-center gap-2 text-sm font-semibold active:scale-95 transition-transform"
      >
        <ArrowLeft size={16} />
        กลับแดชบอร์ด
      </button>

      {/* แผงแสดงสถิติการปักหมุด Real-time */}
      <div className="absolute top-4 right-4 z-40 bg-black/70 backdrop-blur-md p-4 rounded-2xl text-white border border-white/10 shadow-lg text-xs leading-relaxed max-w-[200px]">
        <div className="font-bold text-[10px] text-purple-400 uppercase tracking-wider mb-2">สถานะการบันทึก</div>
        <div>พิกัดกล้อง: <span className="font-mono text-purple-300 font-semibold">{currentPosStr}</span></div>
        <div>จุดเชื่อม (Waypoints): <span className="font-semibold text-white">{wpCount}</span></div>
        <div>เส้นเชื่อม (Edges): <span className="font-semibold text-white">{edges.length}</span></div>
        <div>จุดหมายปลายทาง: <span className="font-semibold text-green-400">{destinations.length}</span></div>
      </div>

      {/* แนะนำขั้นตอนการใช้งานเบื้องต้น */}
      {wpCount === 0 && (
        <div className="absolute top-24 left-1/2 -translate-x-1/2 z-30 bg-purple-600/90 text-white px-5 py-3 rounded-2xl shadow-xl backdrop-blur-md border border-purple-400 max-w-[90%] text-center text-sm leading-relaxed animate-pulse">
          🚶‍♂️ เริ่มต้นเดิน แล้วกดปุ่ม <b>"📍 ปักหมุดเส้นทาง"</b> หรือ <b>"🏪 ปักหมุดร้านค้า"</b> เพื่อเริ่มสร้างเส้นทางนำทาง AR
        </div>
      )}

      {/* ชุดปุ่มกดควบคุม AR Recording (ปุ่มใหญ่เหมาะกับมือถือ) */}
      <div className="absolute bottom-8 left-0 right-0 z-40 px-6 flex flex-col gap-4 max-w-md mx-auto">
        <div className="grid grid-cols-2 gap-3">
          {/* ปุ่มปักหมุดพิกัดทางเดิน */}
          <button
            onClick={handleAddWaypoint}
            className="bg-purple-600 hover:bg-purple-500 active:scale-95 transition-all text-white p-4 rounded-2xl shadow-2xl flex flex-col items-center justify-center gap-1 border border-purple-400 font-bold"
          >
            <MapPin size={24} />
            <span className="text-sm">📍 ปักหมุดเส้นทาง</span>
            <span className="text-[10px] opacity-75 font-normal">จุดเดินผ่าน/ทางเลี้ยว</span>
          </button>

          {/* ปุ่มปักหมุดร้านค้า */}
          <button
            onClick={handleAddDestination}
            className="bg-green-600 hover:bg-green-500 active:scale-95 transition-all text-white p-4 rounded-2xl shadow-2xl flex flex-col items-center justify-center gap-1 border border-green-400 font-bold"
          >
            <Store size={24} />
            <span className="text-sm">🏪 ปักหมุดร้านค้า</span>
            <span className="text-[10px] opacity-75 font-normal">เซ็ตเป็นจุดหมายปลายทาง</span>
          </button>
        </div>

        {/* ปุ่มเซฟเมื่อเดินครบ */}
        <button
          onClick={() => {
            if (wpCount < 2) {
              alert("กรุณาปักหมุดอย่างน้อย 2 จุดก่อนบันทึกแผนที่!");
              return;
            }
            setShowSaveModal(true);
          }}
          disabled={wpCount < 2}
          className={`w-full py-4 rounded-2xl font-bold flex items-center justify-center gap-2 shadow-2xl transition-all border ${
            wpCount < 2
              ? "bg-slate-800 text-slate-500 border-slate-700 cursor-not-allowed"
              : "bg-white text-slate-950 border-white hover:bg-slate-200 active:scale-95"
          }`}
        >
          <Save size={20} />
          เสร็จสิ้นและบันทึกแผนที่ ({wpCount} จุด)
        </button>
      </div>

      {/* ───────── Modal บันทึกแผนที่จริงลง DB ───────── */}
      {showSaveModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md p-6 overflow-y-auto">
          <div className="bg-slate-900 border border-white/10 rounded-3xl w-full max-w-lg p-6 text-white shadow-2xl animate-in fade-in zoom-in-95 duration-200 max-h-[85vh] overflow-y-auto">
            
            {/* Header */}
            <div className="flex items-center justify-between pb-4 border-b border-white/5 mb-6">
              <h3 className="text-xl font-bold flex items-center gap-2">
                <CheckCircle className="text-purple-400" />
                ตั้งค่าและเซฟแผนที่ AR
              </h3>
              <button 
                onClick={() => setShowSaveModal(false)}
                className="p-1 rounded-full hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {errorMsg && (
              <div className="bg-red-500/10 border border-red-500/30 text-red-400 p-3 rounded-xl text-sm mb-4">
                ⚠️ {errorMsg}
              </div>
            )}

            <div className="space-y-4">
              {/* ชื่อแผนที่ */}
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">ชื่อแผนที่ / สถานที่</label>
                <input 
                  type="text" 
                  value={mapName}
                  onChange={(e) => setMapName(e.target.value)}
                  placeholder="เช่น เซ็นทรัลพระราม 9 - ชั้น 3"
                  className="w-full bg-slate-950 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-purple-500 transition-colors"
                />
              </div>

              {/* ชั้น */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">ชั้น (Floor)</label>
                  <input 
                    type="number" 
                    value={floor}
                    onChange={(e) => setFloor(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-purple-500 transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">ความแม่นยำรัศมี (เมตร)</label>
                  <div className="w-full bg-slate-950/50 border border-white/5 rounded-xl px-4 py-3 text-slate-400 select-none">
                    2.5 เมตร (Default)
                  </div>
                </div>
              </div>

              {/* หมายเหตุ */}
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">คำอธิบายแผนที่ (เพิ่มเติม)</label>
                <textarea 
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="คำแนะนำในการเริ่มสแกน หรือข้อมูลเพิ่มเติม..."
                  className="w-full bg-slate-950 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-purple-500 transition-colors h-16 resize-none"
                />
              </div>

              {/* รายการ Destination ที่ปักหมุดไว้ (ให้แก้ไขรายละเอียดได้ที่นี่) */}
              {destinations.length > 0 && (
                <div className="pt-4 border-t border-white/5">
                  <label className="block text-xs font-bold text-green-400 uppercase tracking-wider mb-3">รายละเอียดร้านค้าที่ปักหมุดไว้ ({destinations.length} จุด)</label>
                  
                  <div className="space-y-3 max-h-[220px] overflow-y-auto pr-1">
                    {destinations.map((dest, index) => (
                      <div key={dest.id} className="bg-slate-950 p-4 rounded-xl border border-white/5 flex flex-col gap-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-slate-500">ID: {dest.waypoint}</span>
                          <button 
                            onClick={() => handleRemoveDestination(index)}
                            className="text-red-400 hover:text-red-300 transition-colors"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                        
                        <div className="grid grid-cols-4 gap-2">
                          {/* อีโมจิ */}
                          <div className="col-span-1">
                            <label className="block text-[10px] text-slate-400 mb-1">ไอคอน</label>
                            <input 
                              type="text" 
                              value={dest.icon}
                              onChange={(e) => handleUpdateDestField(index, "icon", e.target.value)}
                              className="w-full bg-slate-900 border border-white/10 rounded-lg py-1.5 text-center text-white focus:outline-none focus:border-purple-500 text-lg"
                            />
                          </div>

                          {/* ชื่อร้าน */}
                          <div className="col-span-3">
                            <label className="block text-[10px] text-slate-400 mb-1">ชื่อร้าน / จุดหมาย</label>
                            <input 
                              type="text" 
                              value={dest.name}
                              onChange={(e) => handleUpdateDestField(index, "name", e.target.value)}
                              className="w-full bg-slate-900 border border-white/10 rounded-lg px-3 py-1.5 text-white focus:outline-none focus:border-purple-500 text-sm"
                            />
                          </div>
                        </div>

                        {/* คำอธิบาย */}
                        <div>
                          <label className="block text-[10px] text-slate-400 mb-1 font-semibold">รายละเอียด</label>
                          <input 
                            type="text" 
                            value={dest.description}
                            onChange={(e) => handleUpdateDestField(index, "description", e.target.value)}
                            className="w-full bg-slate-900 border border-white/10 rounded-lg px-3 py-1.5 text-white focus:outline-none focus:border-purple-500 text-xs"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* ปุ่มเซฟของ Modal */}
            <div className="mt-8 pt-4 border-t border-white/5 flex gap-3">
              <button 
                onClick={() => setShowSaveModal(false)}
                className="flex-1 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold transition-colors"
              >
                ยกเลิก
              </button>
              <button 
                onClick={handleSaveToDatabase}
                disabled={isSubmitting}
                className="flex-1 py-3 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold transition-colors flex items-center justify-center gap-2 shadow-lg shadow-purple-600/30 disabled:opacity-50"
              >
                {isSubmitting ? "กำลังเซฟ..." : "บันทึกแผนที่ลง DB"}
              </button>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
