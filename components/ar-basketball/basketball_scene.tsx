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
    <div ref={containerRef} className="absolute inset-0 w-full h-full bg-black overflow-hidden">
      <canvas id="camerafeed" className="absolute inset-0 w-full h-full object-cover"></canvas>

      {/* ───────── UI HUD (Heads-Up Display) ───────── */}
      <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-center p-4 bg-gradient-to-b from-black/60 to-transparent">
        <div className="flex flex-col items-center rounded-xl bg-slate-900/80 backdrop-blur border border-white/10 px-4 py-2 text-white">
          <span className="text-xs text-purple-400 font-bold tracking-widest">AR PLATFORM PREVIEW</span>
          <span className="text-lg font-bold">🏀 Basketball Hoop Test Mode</span>
        </div>
      </div>

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
