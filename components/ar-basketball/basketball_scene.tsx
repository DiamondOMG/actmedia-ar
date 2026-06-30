"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Home, RotateCcw } from "lucide-react";
import * as THREE from "three";
import { initBasketballScenePipelineModule, GameState } from "@/lib/ar-basketball/basketball_scene_init";

declare const window: any;
declare const XR8: any;
declare const XRExtras: any;

export default function BasketballScene() {
  const containerRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const [xrStarted, setXrStarted] = useState(false);
  const [gameState, setGameState] = useState<GameState>({
    score: 0,
    ballsLeft: 10,
    status: "idle",
  });
  const [showStatus, setShowStatus] = useState<string | null>(null);

  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);

  // เอฟเฟกต์แสดงข้อความสถานะ (เช่น Scored!, Missed!)
  useEffect(() => {
    if (gameState.status === "scored") {
      setShowStatus("🏀 SCORED! +1");
      const timer = setTimeout(() => setShowStatus(null), 1500);
      return () => clearTimeout(timer);
    } else if (gameState.status === "missed") {
      setShowStatus("❌ MISSED");
      const timer = setTimeout(() => setShowStatus(null), 1000);
      return () => clearTimeout(timer);
    }
  }, [gameState.status]);

  useEffect(() => {
    const startAR = () => {
      if (typeof window === "undefined") return;
      if (typeof XR8 === "undefined" || typeof XRExtras === "undefined") {
        setTimeout(startAR, 500);
        return;
      }

      if (!window.THREE) {
        window.THREE = THREE;
      }

      setXrStarted(true);

      XR8.addCameraPipelineModules([
        XR8.GlTextureRenderer.pipelineModule(),
        XR8.Threejs.pipelineModule(),
        XR8.XrController.pipelineModule(),
        XRExtras.AlmostThere.pipelineModule(),
        XRExtras.FullWindowCanvas.pipelineModule(),
        XRExtras.RuntimeError.pipelineModule(),
        initBasketballScenePipelineModule((updatedState) => {
          setGameState((prev) => ({ ...prev, ...updatedState }));
        }),
      ]);

      XR8.run({ canvas: document.getElementById("camerafeed") as HTMLCanvasElement });
    };

    startAR();

    return () => {
      if (typeof XR8 !== "undefined") {
        try {
          XR8.stop();
          XR8.clearCameraPipelineModules();
        } catch (e) {
          console.error(e);
        }
      }
      if (window._cleanupBasketball) {
        window._cleanupBasketball();
      }
    };
  }, []);

  const handleReset = () => {
    router.refresh();
    window.location.reload();
  };

  // ตรวจจับการเริ่มสัมผัสหน้าจอ
  const handleTouchStart = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (e.touches.length === 1 && gameState.status === "idle" && gameState.isHoopPlaced) {
      const touch = e.touches[0];
      touchStartRef.current = {
        x: touch.clientX,
        y: touch.clientY,
        time: Date.now(),
      };
    }
  };

  // ตรวจจับการลากนิ้วเพื่ออัปเดตเส้นไกด์พรีวิววิถีโค้ง
  const handleTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (!touchStartRef.current || gameState.status !== "idle" || !gameState.isHoopPlaced) return;

    if (e.touches.length === 1) {
      const touch = e.touches[0];
      const dy = touchStartRef.current.y - touch.clientY; // ลากขึ้น dy จะเป็นบวก

      if (dy > 10) {
        if (typeof window !== "undefined" && (window as any).updateTrajectoryGuide) {
          (window as any).updateTrajectoryGuide(dy);
        }
      }
    }
  };

  // ตรวจจับการปล่อยนิ้วและโยนลูกบาสตามระยะทาง Y
  const handleTouchEnd = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (!touchStartRef.current || gameState.status !== "idle" || !gameState.isHoopPlaced) return;

    const touch = e.changedTouches[0];
    const dy = touchStartRef.current.y - touch.clientY; // ลากขึ้น dy จะเป็นบวก

    touchStartRef.current = null;

    // ซ่อนเส้นนำทางวิถีทันทีเมื่อปล่อยนิ้ว
    if (typeof window !== "undefined" && (window as any).hideTrajectoryGuide) {
      (window as any).hideTrajectoryGuide();
    }

    // ต้องปัดขึ้นด้านบนด้วยระยะอย่างน้อย 40px
    if (dy < 40) return;

    if (typeof window !== "undefined" && (window as any).throwBasketball && (window as any).getShootVelocity) {
      const worldVelocity = (window as any).getShootVelocity(dy);
      if (worldVelocity) {
        (window as any).throwBasketball(worldVelocity);
      }
    }
  };

  return (
    <div ref={containerRef} className="absolute inset-0 w-full h-full bg-black overflow-hidden select-none">
      <canvas
        id="camerafeed"
        className="absolute inset-0 w-full h-full object-cover"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      ></canvas>

      {/* ───────── UI Overlay บังคับปรับระดับโทรศัพท์ตั้งตรงก่อนเสกแป้น ───────── */}
      {!gameState.isHoopPlaced && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/80 px-8 text-center text-white backdrop-blur-sm">
          <div className="relative mb-6">
            <div className="h-20 w-20 rounded-2xl border-4 border-dashed border-purple-500 animate-pulse flex items-center justify-center">
              <span className="text-4xl">📱</span>
            </div>
            {gameState.isDeviceAligned && (
              <div className="absolute -top-2 -right-2 h-6 w-6 rounded-full bg-emerald-500 flex items-center justify-center text-xs font-bold animate-ping" />
            )}
          </div>
          <h2 className="text-xl font-bold mb-2">📌 กรุณาถือโทรศัพท์ตั้งตรง</h2>
          <p className="text-slate-400 text-sm max-w-xs leading-relaxed mb-6">
            หมุนโทรศัพท์ให้อยู่ในแนวตั้งฉากกับพื้นโลก (ระดับสายตา) เพื่อทำการเสกแป้นบาสเก็ตบอลตรงหน้าคุณ
          </p>
          <div className="flex items-center gap-2 rounded-full bg-white/5 border border-white/10 px-4 py-2 text-xs font-semibold">
            สถานะ:{" "}
            {gameState.isDeviceAligned ? (
              <span className="text-emerald-400 font-bold">● กำลังเสกแป้นบาส...</span>
            ) : (
              <span className="text-amber-400 font-bold">● ระดับยังไม่ได้องศา</span>
            )}
          </div>
        </div>
      )}

      {/* ───────── UI HUD (Heads-Up Display) ───────── */}
      {gameState.isHoopPlaced && (
        <div className="absolute inset-x-0 top-0 z-10 flex flex-col items-center gap-2 p-4 bg-gradient-to-b from-black/60 to-transparent">
          <div className="flex flex-col items-center rounded-xl bg-slate-900/80 backdrop-blur border border-white/10 px-4 py-2 text-white">
            <span className="text-xs text-purple-400 font-bold tracking-widest">AR PLATFORM PREVIEW</span>
            <span className="text-lg font-bold">🏀 Basketball Hoop Test Mode</span>
          </div>

          {/* บอร์ดแสดงสถิติคะแนน */}
          <div className="flex items-center gap-4 rounded-lg bg-slate-900/90 backdrop-blur border border-white/10 px-4 py-1.5 text-sm text-white font-mono">
            <div>คะแนน: <span className="text-amber-400 font-bold text-base">{gameState.score}</span></div>
            <div className="h-3 w-px bg-white/20" />
            <div>เหลือ: <span className="text-purple-400 font-bold text-base">{gameState.ballsLeft}</span> ลูก</div>
          </div>
        </div>
      )}

      {/* ข้อความแสดงสถานะชู้ตจังหวะ scored / missed */}
      {showStatus && (
        <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none">
          <div className="px-6 py-3 rounded-2xl bg-black/85 border border-white/20 text-2xl font-black text-white shadow-2xl animate-bounce">
            {showStatus}
          </div>
        </div>
      )}

      {/* บอร์ดสรุปคะแนนหลังเล่นจบ 10 ลูก */}
      {gameState.ballsLeft === 0 && gameState.status === "idle" && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm px-6">
          <div className="bg-slate-900 border border-white/10 rounded-3xl p-6 max-w-sm w-full text-center text-white shadow-2xl animate-in zoom-in-95">
            <h2 className="text-2xl font-bold mb-2">🎉 จบเกมทดสอบ</h2>
            <p className="text-slate-400 text-sm mb-4">คุณทำคะแนนได้ทั้งหมด</p>
            <div className="text-5xl font-black text-amber-400 mb-6">{gameState.score} คะแนน</div>
            <button
              onClick={handleReset}
              className="w-full py-3.5 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-2xl transition active:scale-95"
            >
              เล่นอีกครั้ง
            </button>
          </div>
        </div>
      )}

      {/* ───────── ปุ่มควบคุมหลักด้านล่าง ───────── */}
      <div className="absolute bottom-4 left-4 right-4 z-10 flex items-center justify-between pointer-events-auto">
        <button
          onClick={() => router.push("/")}
          className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-900/80 text-white backdrop-blur border border-white/10 hover:bg-slate-800 transition"
        >
          <Home className="h-5 w-5" />
        </button>

        <button
          onClick={handleReset}
          className="flex h-12 items-center gap-2 rounded-xl bg-slate-900/80 px-4 text-white backdrop-blur border border-white/10 hover:bg-slate-800 transition"
        >
          <RotateCcw className="h-5 w-5" /> รีเซ็ต
        </button>
      </div>
    </div>
  );
}
