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
      if (typeof XR8 !== "undefined" && xrStarted) {
        XR8.stop();
        XR8.clearCameraPipelineModules();
      }
      if (window._cleanupBasketball) {
        window._cleanupBasketball();
      }
    };
  }, [xrStarted]);

  const handleReset = () => {
    // รีเซ็ตเกมง่ายๆ โดยรีโหลดหน้าเว็บเพื่อเคลียร์ state และกล้อง XR
    router.refresh();
    window.location.reload();
  };

  return (
    <div ref={containerRef} className="relative h-screen w-screen overflow-hidden bg-black font-sans">
      {/* หน้าจอกล้อง AR */}
      <canvas id="camerafeed" className="absolute inset-0 h-full w-full object-cover" />

      {/* ───────── UI HUD (Heads-Up Display) ───────── */}
      <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-between p-4 bg-gradient-to-b from-black/60 to-transparent">
        {/* คะแนน */}
        <div className="flex flex-col rounded-xl bg-slate-900/80 backdrop-blur border border-white/10 px-4 py-2 text-white">
          <span className="text-xs text-slate-400 font-medium">SCORE</span>
          <span className="text-2xl font-bold tracking-wider">{gameState.score}</span>
        </div>

        {/* ลูกบอลที่เหลือ */}
        <div className="flex flex-col items-end rounded-xl bg-slate-900/80 backdrop-blur border border-white/10 px-4 py-2 text-white">
          <span className="text-xs text-slate-400 font-medium">BALLS LEFT</span>
          <span className="text-2xl font-bold tracking-wider">{gameState.ballsLeft}</span>
        </div>
      </div>

      {/* ข้อความแสดงผลขนาดยักษ์ตรงกลางจอเมื่อชู้ตลง/พลาด */}
      {showStatus && (
        <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none animate-ping duration-300">
          <div className={`px-6 py-3 rounded-2xl text-2xl font-extrabold tracking-widest text-white shadow-2xl backdrop-blur-md ${
            showStatus.includes("SCORED") ? "bg-emerald-500/80 border border-emerald-400" : "bg-rose-500/80 border border-rose-400"
          }`}>
            {showStatus}
          </div>
        </div>
      )}

      {/* แนะนำวิธีการเล่นแบบกะทัดรัดด้านล่าง */}
      {gameState.status === "idle" && (
        <div className="absolute bottom-20 inset-x-0 z-10 flex justify-center pointer-events-none">
          <p className="px-4 py-2 rounded-full bg-black/50 text-white text-xs font-semibold backdrop-blur border border-white/10">
            แตะหรือคลิกบนหน้าจอเพื่อโยนลูกบาสไปยังห่วง 🏀
          </p>
        </div>
      )}

      {/* เกมโอเวอร์ */}
      {gameState.ballsLeft === 0 && gameState.status === "idle" && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-slate-950/90 backdrop-blur p-6 text-center">
          <h2 className="text-3xl font-black text-white mb-2">GAME OVER 🏆</h2>
          <p className="text-lg text-slate-400 mb-6">คุณทำคะแนนได้ทั้งหมด {gameState.score} คะแนน!</p>
          <button
            onClick={handleReset}
            className="flex items-center gap-2 rounded-xl bg-purple-600 hover:bg-purple-500 px-6 py-3 text-white font-bold transition shadow-lg shadow-purple-600/30"
          >
            <RotateCcw className="h-5 w-5" /> เล่นใหม่อีกครั้ง
          </button>
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
