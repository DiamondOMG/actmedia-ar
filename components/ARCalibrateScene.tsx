"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { positionProvider } from "@/lib/position-provider";
import { Menu, ArrowLeft, RotateCcw, Check, HelpCircle } from "lucide-react";
import * as THREE from "three";

declare const window: any;
declare const XR8: any;
declare const XRExtras: any;

let rawCameraPos = new THREE.Vector3();
let startPos = new THREE.Vector3(0, 0, 0);

const initCalibratePipelineModule = (onUpdateCb: () => void) => {
  return {
    name: "calibrate-scene-init",
    onStart: () => {
      const { scene, camera } = XR8.Threejs.xrScene();

      // เพิ่มแสงสว่าง
      const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
      scene.add(ambientLight);

      const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
      directionalLight.position.set(5, 10, 7);
      scene.add(directionalLight);

      // สร้างจุดเริ่มต้นเสมือน (ลูกบอลสีน้ำเงินที่ 0,0,0)
      const originSphere = new THREE.Mesh(
        new THREE.SphereGeometry(0.12, 16, 16),
        new THREE.MeshBasicMaterial({ color: 0x3b82f6 })
      );
      originSphere.position.set(0, 0.05, 0);
      scene.add(originSphere);

      // วาดเส้นแนวตรงขนานพื้นยาว 10 เมตร ชี้ไปทิศหน้ากล้องตอนกดรีเซ็ต (-Z)
      const points = [
        new THREE.Vector3(0, 0.05, 0),
        new THREE.Vector3(0, 0.05, -10),
      ];
      const lineGeo = new THREE.BufferGeometry().setFromPoints(points);
      const lineMat = new THREE.LineBasicMaterial({ color: 0x10b981, linewidth: 4 });
      const line = new THREE.Line(lineGeo, lineMat);
      scene.add(line);

      // วาดเป้าสีแดงที่ระยะ 10 เมตรเสมือน
      const targetSphere = new THREE.Mesh(
        new THREE.SphereGeometry(0.18, 16, 16),
        new THREE.MeshBasicMaterial({ color: 0xef4444 })
      );
      targetSphere.position.set(0, 0.05, -10);
      scene.add(targetSphere);

      // วาดหลักวัดระยะเสมือนทุกๆ 1 เมตร
      for (let i = 1; i < 10; i++) {
        const marker = new THREE.Mesh(
          new THREE.SphereGeometry(0.06, 16, 16),
          new THREE.MeshBasicMaterial({ color: 0xf59e0b })
        );
        marker.position.set(0, 0.05, -i);
        scene.add(marker);
      }

      XR8.XrController.recenter();
    },
    onUpdate: () => {
      if (typeof XR8 === "undefined") return;
      const { camera } = XR8.Threejs.xrScene();
      if (!camera) return;

      rawCameraPos.copy(camera.position);

      // อัปเดตพิกัดลง positionProvider ตามปกติ
      positionProvider.updateFromSlam(camera.position, camera.quaternion);

      onUpdateCb();
    },
  };
};

export default function ARCalibrateScene() {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const [xrStarted, setXrStarted] = useState(false);
  const [isCalibrating, setIsCalibrating] = useState(false);
  const [slamDistance, setSlamDistance] = useState(0);
  const [scaleFactor, setScaleFactor] = useState(1.0);
  const [showInstruction, setShowInstruction] = useState(true);



  useEffect(() => {
    let isMounted = true;

    const startAR = () => {
      if (typeof window === "undefined") return;
      if (typeof XR8 === "undefined" || typeof XRExtras === "undefined") {
        setTimeout(startAR, 500);
        return;
      }
      if (!window.THREE) window.THREE = THREE;

      setXrStarted(true);

      const updateUI = () => {
        if (!isMounted) return;

        // คำนวณระยะห่างทางราบ (X, Z) จากจุดเริ่มต้นของการ Calibrate (หลังกดรีเซ็ต)
        const dx = rawCameraPos.x - startPos.x;
        const dz = rawCameraPos.z - startPos.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        setSlamDistance(dist);
      };

      XR8.addCameraPipelineModules([
        XR8.GlTextureRenderer.pipelineModule(),
        XR8.Threejs.pipelineModule(),
        XR8.XrController.pipelineModule(),
        XRExtras.AlmostThere.pipelineModule(),
        XRExtras.FullWindowCanvas.pipelineModule(),
        XRExtras.RuntimeError.pipelineModule(),
        initCalibratePipelineModule(updateUI),
      ]);

      XR8.run({ canvas: document.getElementById("camerafeed") as HTMLCanvasElement });
    };

    startAR();

    return () => {
      isMounted = false;
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

  const handleResetCalibration = () => {
    if (typeof XR8 !== "undefined") {
      XR8.XrController.recenter();
    }
    startPos.copy(rawCameraPos);
    setSlamDistance(0);
    setIsCalibrating(true);
  };

  const handleApplyScaleFactor = (factor: number) => {
    if (isNaN(factor) || factor <= 0) return;
    setScaleFactor(factor);
    positionProvider.scaleFactor = factor;
  };

  const handleSaveAndExit = () => {
    alert(`ผลการคำนวณ Scale Factor: ${scaleFactor.toFixed(4)} (กรุณานำตัวเลขนี้ไปฮาร์ดโค้ดในโปรเจคตามต้องการ)`);
    router.push("/dashboard");
  };

  // คำนวณตัวคูณชดเชยเพื่อให้ SLAM Distance = 10 เมตรเป๊ะ
  const calculatedFactor = slamDistance > 0 ? 10.0 / slamDistance : 1.0;

  return (
    <div ref={containerRef} className="absolute inset-0 w-full h-full bg-black overflow-hidden font-sans text-white">
      <canvas id="camerafeed" className="absolute inset-0 w-full h-full object-cover"></canvas>

      {/* หน้าต่างโหลดกล้อง */}
      {!xrStarted && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950 pointer-events-none z-[200]">
          <div className="absolute left-1/2 top-1/2 h-[300px] w-[300px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-purple-600/20 blur-[100px]" />
          <div className="relative mb-6">
            <div className="h-16 w-16 rounded-full border-4 border-purple-500/20" />
            <div className="absolute inset-0 h-16 w-16 rounded-full border-4 border-transparent border-t-purple-500 animate-spin" />
          </div>
          <p className="text-lg font-semibold text-white mb-1">กำลังเปิดหน้าทดสอบสเกล AR</p>
          <p className="text-sm text-slate-400">กรุณารอสักครู่...</p>
        </div>
      )}

      {/* แถบควบคุมด้านบน */}
      <div className="absolute top-6 left-6 right-6 z-50 flex items-center justify-between pointer-events-none">
        <button
          onClick={() => router.push("/dashboard")}
          className="bg-black/60 backdrop-blur-md p-3 rounded-full border border-white/20 text-white shadow-lg active:scale-95 transition-transform pointer-events-auto"
        >
          <ArrowLeft size={20} />
        </button>

        <h1 className="bg-black/60 backdrop-blur-md px-4 py-2 rounded-full border border-white/10 text-sm font-semibold tracking-wide shadow-md">
          AR Scale Calibrator 📏
        </h1>

        <button
          onClick={() => setShowInstruction(!showInstruction)}
          className="bg-black/60 backdrop-blur-md p-3 rounded-full border border-white/20 text-white shadow-lg active:scale-95 transition-transform pointer-events-auto"
        >
          <HelpCircle size={20} />
        </button>
      </div>

      {/* บอร์ดคำอธิบายวิธีการทำ Calibrate */}
      {showInstruction && (
        <div className="absolute inset-x-6 top-24 z-50 bg-slate-950/90 backdrop-blur-md border border-white/10 p-5 rounded-2xl shadow-2xl animate-in fade-in slide-in-from-top-4 duration-300">
          <div className="flex items-center justify-between mb-3 border-b border-white/10 pb-2">
            <h3 className="font-bold text-base text-purple-400">💡 วิธีการปรับเทียบระยะ (Calibrate)</h3>
            <button onClick={() => setShowInstruction(false)} className="text-xs text-slate-400 underline hover:text-white">ปิดคำแนะนำ</button>
          </div>
          <ol className="text-xs text-slate-300 space-y-2 list-decimal list-inside leading-relaxed">
            <li>เตรียมสถานที่: วัดระยะห่าง 10 เมตรบนพื้นจริง และทำจุดทำเครื่องหมายไว้</li>
            <li>ยืนที่จุดเริ่มต้น ส่องมือถือไปที่ทางเดินข้างหน้า</li>
            <li>กดปุ่ม <span className="text-blue-400 font-bold">"เริ่ม Calibrate"</span> ด้านล่าง เพื่อเซ็ตจุดเริ่มที่ 0 เมตร</li>
            <li>เดินตรงเป็นแนวเส้นตรงตามระยะจริงไป 10 เมตร</li>
            <li>เมื่อเดินถึงจุด 10 เมตรจริงแล้ว ให้ยืนนิ่งๆ และกดปุ่ม <span className="text-green-400 font-bold">"ใช้ตัวคูณนี้ (Scale: ...)"</span></li>
          </ol>
        </div>
      )}

      {/* บอร์ดแสดงผลข้อมูลการวัดระยะ */}
      <div className="absolute bottom-6 inset-x-6 z-40 bg-slate-900/90 backdrop-blur-xl border border-white/10 rounded-3xl p-6 shadow-2xl flex flex-col gap-5">

        {/* แถบตัวเลขระยะทาง */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white/5 border border-white/5 rounded-2xl p-4 text-center">
            <div className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider mb-1">ระยะทาง AR (SLAM)</div>
            <div className="text-3xl font-black text-white font-mono leading-none">
              {slamDistance.toFixed(2)}<span className="text-xs font-normal text-slate-400 ml-1">ม.</span>
            </div>
            <div className="text-[10px] text-slate-500 mt-1.5">ระยะดิบวัดโดยอุปกรณ์</div>
          </div>

          <div className="bg-white/5 border border-white/5 rounded-2xl p-4 text-center">
            <div className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider mb-1">ระยะชดเชย (Scaled)</div>
            <div className="text-3xl font-black text-purple-400 font-mono leading-none">
              {(slamDistance * scaleFactor).toFixed(2)}<span className="text-xs font-normal text-slate-400 ml-1">ม.</span>
            </div>
            <div className="text-[9px] text-slate-500 mt-1.5">ตัวคูณปัจจุบัน: {scaleFactor.toFixed(3)}</div>
          </div>
        </div>

        {/* ส่วนตั้งค่า Scale Factor ปัจจุบัน */}
        <div className="flex flex-col gap-2 bg-black/40 border border-white/5 rounded-2xl p-4">
          <div className="flex justify-between items-center text-xs">
            <span className="text-slate-300 font-medium">ค่า Scale Factor ปัจจุบัน</span>
            <span className="font-mono font-bold text-purple-400 text-sm">{scaleFactor.toFixed(4)}</span>
          </div>

          {/* ปรับสเกลแมนนวล */}
          <div className="flex items-center gap-3 mt-1">
            <input
              type="range"
              min="0.5"
              max="2.5"
              step="0.01"
              value={scaleFactor}
              onChange={(e) => handleApplyScaleFactor(parseFloat(e.target.value))}
              className="flex-1 accent-purple-500 cursor-pointer h-1.5 bg-slate-700 rounded-lg appearance-none"
            />
            <button
              onClick={() => handleApplyScaleFactor(1.0)}
              className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 rounded-lg text-[10px] font-bold text-slate-300"
            >
              Reset (1.0)
            </button>
          </div>
        </div>

        {/* แถบการสั่งงานและคำนวณ */}
        <div className="flex flex-col gap-3">
          {isCalibrating && slamDistance > 0.5 ? (
            <button
              onClick={() => handleApplyScaleFactor(calculatedFactor)}
              className="w-full bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white font-bold py-3.5 px-4 rounded-2xl shadow-lg transition-colors flex items-center justify-center gap-2 active:scale-[0.98]"
            >
              <Check size={18} />
              ใช้ตัวคูณนี้ (Scale: {calculatedFactor.toFixed(3)})
            </button>
          ) : (
            <div className="text-center text-xs text-slate-400 py-1 bg-white/5 rounded-xl border border-white/5">
              {!isCalibrating ? "กดปุ่มด้านล่างเพื่อเริ่มการ Calibrate" : "กรุณาเดินห่างจากจุดเริ่มต้นเพื่อคำนวณตัวคูณ"}
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={handleResetCalibration}
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 px-4 rounded-2xl shadow-lg transition-colors flex items-center justify-center gap-2 active:scale-[0.98]"
            >
              <RotateCcw size={18} />
              {isCalibrating ? "รีเซ็ตระยะ (0m)" : "เริ่ม Calibrate"}
            </button>

            <button
              onClick={handleSaveAndExit}
              className="bg-white hover:bg-slate-100 text-slate-900 font-bold py-4 px-6 rounded-2xl shadow-lg transition-colors active:scale-[0.98]"
            >
              เสร็จสิ้น
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
