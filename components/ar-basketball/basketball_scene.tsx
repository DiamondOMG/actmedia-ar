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
    isAssetLoaded: false,
    assetLoadProgress: 0,
  });
  const [showStatus, setShowStatus] = useState<string | null>(null);
  const [difficulty, setDifficulty] = useState<"easy" | "hard">("easy");

  const toggleDifficulty = (mode: "easy" | "hard") => {
    setDifficulty(mode);
    if (typeof window !== "undefined" && (window as any).setDifficulty) {
      (window as any).setDifficulty(mode);
    }
  };

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
      // เปิดระบบเล็งและเรนเดอร์เส้นวิถี 60fps ทันที
      if (typeof window !== "undefined" && (window as any).startAiming) {
        (window as any).startAiming();
      }
    }
  };

  // ตรวจจับการลากนิ้วเพื่ออัปเดตระยะลากของการเล็ง
  const handleTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (!touchStartRef.current || gameState.status !== "idle" || !gameState.isHoopPlaced) return;

    if (e.touches.length === 1) {
      const touch = e.touches[0];
      const rawDy = touchStartRef.current.y - touch.clientY; // ลากขึ้น dy จะเป็นบวก
      const dy = Math.max(rawDy, 0); // ไม่ให้แรงต่ำกว่า 0

      if (typeof window !== "undefined" && (window as any).updateAimingDy) {
        (window as any).updateAimingDy(dy);
      }
    }
  };

  // ตรวจจับการปล่อยนิ้วและโยนลูกบาสตามระยะทาง Y ในทุกกรณี (Release to Shoot)
  const handleTouchEnd = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (!touchStartRef.current || gameState.status !== "idle" || !gameState.isHoopPlaced) return;

    const touch = e.changedTouches[0];
    const rawDy = touchStartRef.current.y - touch.clientY; // ลากขึ้น dy จะเป็นบวก
    const dy = Math.max(rawDy, 0); // ไม่ให้แรงต่ำกว่า 0

    touchStartRef.current = null;

    // สั่งปิดระบบเล็งและซ่อนเส้นวิถี
    if (typeof window !== "undefined" && (window as any).stopAiming) {
      (window as any).stopAiming();
    }

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
        onTouchCancel={handleTouchEnd}
        onContextMenu={(e) => e.preventDefault()}
      ></canvas>

      {/* ───────── UI Overlay บังคับปรับระดับโทรศัพท์ตั้งตรงก่อนเสกแป้น ───────── */}
      {!gameState.isHoopPlaced && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/80 px-8 text-center text-white backdrop-blur-sm">
          {!gameState.isAssetLoaded ? (
            // หน้าจอแสดงความคืบหน้าการดาวน์โหลดโมเดล 3D
            <div className="flex flex-col items-center animate-in fade-in duration-300">
              <div className="relative mb-6">
                <div className="h-20 w-20 rounded-2xl border-4 border-dashed border-purple-500 animate-spin flex items-center justify-center">
                  <span className="text-4xl animate-none">🏀</span>
                </div>
              </div>
              <h2 className="text-xl font-bold mb-2">📥 กำลังดาวน์โหลดโมเดลลูกบาส...</h2>
              <p className="text-slate-400 text-sm max-w-xs leading-relaxed mb-6 font-mono">
                กรุณารอสักครู่เพื่อเตรียมทรัพยากรเกมให้พร้อม {gameState.assetLoadProgress || 0}%
              </p>
              <div className="w-48 h-2 bg-white/10 rounded-full overflow-hidden border border-white/5">
                <div
                  className="h-full bg-purple-500 transition-all duration-300 rounded-full"
                  style={{ width: `${gameState.assetLoadProgress || 0}%` }}
                />
              </div>
            </div>
          ) : (
            // หน้าจอเตือนตั้งตรงโทรศัพท์ตามระดับองศา
            <>
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
            </>
          )}
        </div>
      )}

      {/* ───────── UI HUD (Heads-Up Display) ไว้ฝั่งซ้ายบน ───────── */}
      {gameState.isHoopPlaced && (
        <div className="absolute top-4 left-3 z-10 pointer-events-none">
          <div className="rounded-xl bg-black/60 backdrop-blur-sm border border-white/10 px-3 py-2 text-white font-mono text-xs flex flex-col gap-1">
            <div className="flex items-center gap-1.5">
              <span className="text-purple-400 font-bold text-[10px]">R{gameState.currentRound || 1}/3</span>
              <span className="text-white/30">|</span>
              <span className="text-amber-400 font-bold">{gameState.score}</span>
              <span className="text-white/30">|</span>
              <span className="text-slate-300">{gameState.ballsLeft}🏀</span>
            </div>
          </div>
        </div>
      )}
      {/* ───────── ปุ่มปรับระดับความยาก Easy / Hard (มุมขวาบน) ───────── */}
      {gameState.isHoopPlaced && (
        <div className="absolute top-4 right-3 z-10 flex gap-1 rounded-xl bg-black/60 backdrop-blur-sm p-1 border border-white/10 font-mono text-[10px] font-bold">
          <button
            onClick={() => toggleDifficulty("easy")}
            className={`px-3 py-1.5 rounded-lg transition active:scale-95 ${difficulty === "easy"
                ? "bg-purple-600 text-white shadow"
                : "text-slate-400 hover:text-white"
              }`}
          >
            EASY
          </button>
          <button
            onClick={() => toggleDifficulty("hard")}
            className={`px-3 py-1.5 rounded-lg transition active:scale-95 ${difficulty === "hard"
                ? "bg-purple-600 text-white shadow"
                : "text-slate-400 hover:text-white"
              }`}
          >
            HARD
          </button>
        </div>
      )}

      {/* ข้อความแสดงสถานะชู้ตจังหวะ scored / missed */}
      {showStatus && (
        <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none">
          {gameState.status === "scored" ? (
            /* LED Scoreboard Popup (เนียนสไตล์บอร์ดจริง) */
            <div className="flex flex-col items-center justify-center p-2.5 bg-[#4a4a4a] border-4 border-[#c0c0c0] rounded-[28px] w-[260px] shadow-2xl animate-in zoom-in-95 duration-200">
              {/* ส่วนบน (Time & Team) */}
              <div className="flex items-center justify-between w-full bg-[#1b1b1b] rounded-2xl px-4 py-2 border border-[#2b2b2b] mb-2">
                <span className="text-xl font-extrabold italic tracking-widest text-white drop-shadow-[1px_1px_2px_rgba(0,0,0,0.8)]">GUEST</span>
                <div className="bg-[#0c0c0c] border border-[#222] rounded-lg px-2.5 py-1">
                  <span className="text-red-500 font-mono text-xs font-bold tracking-widest drop-shadow-[0_0_4px_rgba(239,68,68,0.9)]">
                    01:00
                  </span>
                </div>
              </div>
              {/* ส่วนล่าง (Score 2 หลัก) */}
              <div className="flex items-center justify-center gap-3 w-full bg-[#1b1b1b] rounded-2xl p-3.5 border border-[#2b2b2b]">
                {/* หลักสิบ */}
                <div className="relative bg-[#0a0a0a] border-2 border-[#151515] rounded-xl w-20 h-28 flex items-center justify-center shadow-inner overflow-hidden">
                  <span className="text-7xl font-black text-[#ff1e1e] font-mono select-none drop-shadow-[0_0_10px_#ff0000] z-0 leading-none">
                    {String(gameState.score).padStart(2, "0")[0]}
                  </span>
                  <div 
                    className="absolute inset-0 pointer-events-none z-10" 
                    style={{
                      backgroundImage: 'radial-gradient(circle, rgba(0,0,0,0.9) 35%, transparent 40%)',
                      backgroundSize: '4px 4px'
                    }}
                  />
                </div>
                {/* หลักหน่วย */}
                <div className="relative bg-[#0a0a0a] border-2 border-[#151515] rounded-xl w-20 h-28 flex items-center justify-center shadow-inner overflow-hidden">
                  <span className="text-7xl font-black text-[#ff1e1e] font-mono select-none drop-shadow-[0_0_10px_#ff0000] z-0 leading-none">
                    {String(gameState.score).padStart(2, "0")[1]}
                  </span>
                  <div 
                    className="absolute inset-0 pointer-events-none z-10" 
                    style={{
                      backgroundImage: 'radial-gradient(circle, rgba(0,0,0,0.9) 35%, transparent 40%)',
                      backgroundSize: '4px 4px'
                    }}
                  />
                </div>
              </div>
            </div>
          ) : (
            /* Missed banner */
            <div className="px-6 py-3 rounded-2xl bg-black/85 border border-white/20 text-2xl font-black text-white shadow-2xl animate-bounce">
              {showStatus}
            </div>
          )}
        </div>
      )}

      {/* บอร์ดสรุปคะแนนหลังเล่นจบครบ 3 รอบ */}
      {gameState.ballsLeft === 0 && gameState.currentRound === 3 && gameState.status === "idle" && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md px-6">
          <div className="bg-slate-900 border border-white/10 rounded-3xl p-7 max-w-sm w-full text-center text-white shadow-2xl animate-in zoom-in-95 duration-200">
            <span className="text-4xl mb-2 block">🏆</span>
            <h2 className="text-2xl font-bold mb-1">จบการแข่งขัน 3 รอบ</h2>
            <p className="text-slate-400 text-xs mb-5">สรุปคะแนนการทดสอบชู้ตบาสเก็ตบอล AR</p>

            <div className="bg-white/5 rounded-2xl p-4 border border-white/5 mb-6">
              <div className="text-sm text-slate-400 mb-1">คะแนนรวมสุทธิ</div>
              <div className="text-5xl font-black text-amber-400 font-mono leading-none mb-1">{gameState.score}</div>
              <div className="text-[10px] text-slate-500">ยิงสำเร็จจากโอกาสทั้งหมด 9 ครั้ง</div>
            </div>

            <button
              onClick={handleReset}
              className="w-full py-3.5 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-2xl transition active:scale-95 shadow-lg shadow-purple-600/30"
            >
              เริ่มท้าทายใหม่
            </button>
          </div>
        </div>
      )}

      {/* ───────── Tutorial ลากขึ้น (Swipe Up Tutorial) ───────── */}
      {gameState.isHoopPlaced && gameState.status === "idle" && (
        <div className="absolute inset-0 flex flex-col items-center justify-end pb-32 pointer-events-none z-10">
          <div className="flex flex-col items-center gap-2">
            <style>{`
              @keyframes swipe_up_anim {
                0% { transform: translateY(40px); opacity: 0; }
                20% { opacity: 0.8; }
                80% { transform: translateY(-40px); opacity: 0.2; }
                100% { transform: translateY(-40px); opacity: 0; }
              }
              .animate-swipe-up {
                animation: swipe_up_anim 2s infinite ease-in-out;
              }
            `}</style>
            <div className="w-16 h-16 animate-swipe-up">
              <svg viewBox="0 0 24 24" fill="rgba(255,255,255,0.2)" stroke="rgba(255,255,255,0.8)" strokeWidth="1.5" className="w-full h-full">
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.05 4.575a1.5 1.5 0 1 1 2.9 1.05l-1.05 2.9H18.75a1.5 1.5 0 0 1 1.5 1.5V15a6 6 0 0 1-6 6h-2.25a6 6 0 0 1-6-6v-3.75a1.5 1.5 0 0 1 1.5-1.5h.75V5.625a1.5 1.5 0 0 1 1.5-1.5h1.8Z" />
              </svg>
            </div>
            <span className="text-white/80 text-xs font-semibold tracking-wider drop-shadow-md">
              ลากลูกบาสขึ้นเพื่อชู้ต
            </span>
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
