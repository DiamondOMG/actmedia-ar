"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Home, RotateCcw, Menu, X, Wind, Timer, Compass, Target } from "lucide-react";
import * as THREE from "three";
import { initBasketballScenePipelineModule, GameState, GameMode } from "@/lib/ar-basketball/basketball_scene_init";

declare const window: any;
declare const XR8: any;
declare const XRExtras: any;

export default function BasketballScene() {
  const containerRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const [xrStarted, setXrStarted] = useState(false);
  const [gameState, setGameState] = useState<GameState>({
    score: 0,
    ballsLeft: 3,
    status: "idle",
    isAssetLoaded: false,
    assetLoadProgress: 0,
  });
  const [showStatus, setShowStatus] = useState<string | null>(null);
  const [difficulty, setDifficulty] = useState<"easy" | "hard">("easy");
  
  // โหมดเกม และ แฮมเบอร์เกอร์เมนู
  const [gameMode, setGameMode] = useState<GameMode>("normal");
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const toggleDifficulty = (mode: "easy" | "hard") => {
    setDifficulty(mode);
    if (typeof window !== "undefined" && (window as any).setDifficulty) {
      (window as any).setDifficulty(mode);
    }
  };

  // ดึงค่า URL Parameter เมื่อ Mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const modeParam = params.get("mode") as GameMode;
      if (modeParam && ["normal", "fade", "multi", "wind", "time_attack"].includes(modeParam)) {
        setGameMode(modeParam);
      }
    }
  }, []);

  // ซิงก์โหมดไปยัง Three.js เมื่อเริ่มฉากแล้ว
  useEffect(() => {
    if (gameState.isHoopPlaced && typeof window !== "undefined" && (window as any).setGameMode) {
      (window as any).setGameMode(gameMode);
    }
  }, [gameState.isHoopPlaced, gameMode]);

  const selectMode = (mode: GameMode) => {
    setGameMode(mode);
    setIsMenuOpen(false);
    if (typeof window !== "undefined") {
      if ((window as any).setGameMode) {
        (window as any).setGameMode(mode);
      }
      const newUrl = `${window.location.pathname}?mode=${mode}`;
      window.history.pushState(null, "", newUrl);
    }
  };

  const isDraggingRef = useRef<boolean>(false);

  // เอฟเฟกต์แสดงข้อความสถานะ (เช่น Scored!, Missed!)
  useEffect(() => {
    if (gameState.status === "scored") {
      const multText = gameState.activeHoopMultiplier && gameState.activeHoopMultiplier > 1 
        ? ` (x${gameState.activeHoopMultiplier})` 
        : "";
      setShowStatus(`🏀 SCORED! +${gameState.activeHoopMultiplier || 1}${multText}`);
      const timer = setTimeout(() => setShowStatus(null), 1500);
      return () => clearTimeout(timer);
    } else if (gameState.status === "missed") {
      setShowStatus("❌ MISSED");
      const timer = setTimeout(() => setShowStatus(null), 1000);
      return () => clearTimeout(timer);
    }
  }, [gameState.status, gameState.activeHoopMultiplier]);

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

  // ตรวจจับการเริ่มสัมผัสหน้าจอเพื่อเริ่มลากลูกบอล
  const handleTouchStart = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (e.touches.length === 1 && gameState.status === "idle" && gameState.isHoopPlaced) {
      const touch = e.touches[0];
      isDraggingRef.current = true;
      if (typeof window !== "undefined" && (window as any).startDragging) {
        (window as any).startDragging(touch.clientX, touch.clientY);
      }
    }
  };

  // ตรวจจับการลากนิ้วเพื่อย้ายลูกบอลตาม
  const handleTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDraggingRef.current || gameState.status !== "idle" || !gameState.isHoopPlaced) return;

    if (e.touches.length === 1) {
      const touch = e.touches[0];
      if (typeof window !== "undefined" && (window as any).updateDragging) {
        (window as any).updateDragging(touch.clientX, touch.clientY);
      }
    }
  };

  // ตรวจจับการปล่อยนิ้วเพื่อคำนวณเวกเตอร์ความเร็วและชู้ต
  const handleTouchEnd = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDraggingRef.current || gameState.status !== "idle" || !gameState.isHoopPlaced) return;

    isDraggingRef.current = false;
    const touch = e.changedTouches[0];
    if (typeof window !== "undefined" && (window as any).stopDraggingAndThrow) {
      (window as any).stopDraggingAndThrow(touch.clientX, touch.clientY);
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

      {/* ───────── ปุ่ม Hamburger Menu (มุมบนซ้าย) ───────── */}
      {gameState.isHoopPlaced && (
        <button
          onClick={() => setIsMenuOpen(true)}
          className="absolute top-4 left-3 z-30 flex h-10 w-10 items-center justify-center rounded-xl bg-black/60 text-white backdrop-blur border border-white/10 hover:bg-black/80 transition active:scale-95 shadow"
        >
          <Menu className="h-5 w-5" />
        </button>
      )}

      {/* ───────── Hamburger Menu Panel (Glassmorphism Slide-over) ───────── */}
      {isMenuOpen && (
        <div className="absolute inset-0 z-40 flex bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-72 bg-slate-950/90 border-r border-white/15 h-full p-6 text-white flex flex-col justify-between shadow-2xl animate-in slide-in-from-left duration-300">
            <div>
              <div className="flex items-center justify-between mb-8">
                <span className="text-lg font-black tracking-wider text-purple-400 flex items-center gap-1.5 font-sans">
                  🏀 SELECT MODE
                </span>
                <button
                  onClick={() => setIsMenuOpen(false)}
                  className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 transition"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="flex flex-col gap-3 font-sans">
                <button
                  onClick={() => selectMode("normal")}
                  className={`w-full p-3 rounded-xl border text-left transition flex items-center justify-between ${
                    gameMode === "normal"
                      ? "bg-purple-600/20 border-purple-500 text-white"
                      : "bg-white/5 border-white/5 hover:bg-white/10 text-slate-300"
                  }`}
                >
                  <div>
                    <div className="font-bold text-sm">🏆 โหมดปกติ (Normal)</div>
                    <div className="text-[10px] text-slate-400">ยิง 3 ระยะ ท้าทายคะแนนตัวคูณ</div>
                  </div>
                  <Target className="h-4 w-4 text-purple-400 font-sans" />
                </button>

                <button
                  onClick={() => selectMode("fade")}
                  className={`w-full p-3 rounded-xl border text-left transition flex items-center justify-between ${
                    gameMode === "fade"
                      ? "bg-purple-600/20 border-purple-500 text-white"
                      : "bg-white/5 border-white/5 hover:bg-white/10 text-slate-300"
                  }`}
                >
                  <div>
                    <div className="font-bold text-sm">⚡ โหมดแวบหาย (Fade)</div>
                    <div className="text-[10px] text-slate-400">จำกัด 3.5 วิ แป้นสุ่มเทเลพอร์ต</div>
                  </div>
                  <Timer className="h-4 w-4 text-purple-400" />
                </button>

                <button
                  onClick={() => selectMode("multi")}
                  className={`w-full p-3 rounded-xl border text-left transition flex items-center justify-between ${
                    gameMode === "multi"
                      ? "bg-purple-600/20 border-purple-500 text-white"
                      : "bg-white/5 border-white/5 hover:bg-white/10 text-slate-300"
                  }`}
                >
                  <div>
                    <div className="font-bold text-sm">🔱 โหมดหลายแป้น (Multi-Hoop)</div>
                    <div className="text-[10px] text-slate-400">3 ระยะพร้อมกัน / ลุ้นแป้นทอง *5</div>
                  </div>
                  <Compass className="h-4 w-4 text-purple-400" />
                </button>

                <button
                  onClick={() => selectMode("wind")}
                  className={`w-full p-3 rounded-xl border text-left transition flex items-center justify-between ${
                    gameMode === "wind"
                      ? "bg-purple-600/20 border-purple-500 text-white"
                      : "bg-white/5 border-white/5 hover:bg-white/10 text-slate-300"
                  }`}
                >
                  <div>
                    <div className="font-bold text-sm">💨 แรงลมท้าทาย (Wind)</div>
                    <div className="text-[10px] text-slate-400">ลมพัดเบี่ยงทิศทางลูกบาส</div>
                  </div>
                  <Wind className="h-4 w-4 text-purple-400" />
                </button>

                <button
                  onClick={() => selectMode("time_attack")}
                  className={`w-full p-3 rounded-xl border text-left transition flex items-center justify-between ${
                    gameMode === "time_attack"
                      ? "bg-purple-600/20 border-purple-500 text-white"
                      : "bg-white/5 border-white/5 hover:bg-white/10 text-slate-300"
                  }`}
                >
                  <div>
                    <div className="font-bold text-sm">🔥 จับเวลาบ้าคลั่ง (Time Attack)</div>
                    <div className="text-[10px] text-slate-400">60 วิไม่จำกัดบอล ยิงคอมโบเพิ่มเวลา</div>
                  </div>
                  <Timer className="h-4 w-4 text-purple-400" />
                </button>
              </div>
            </div>

            <div className="text-[10px] text-slate-500 font-mono text-center">
              AR Basketball Mode Selector v2.0
            </div>
          </div>
          {/* ส่วนปิดเมื่อแตะขอบนอก */}
          <div className="flex-1" onClick={() => setIsMenuOpen(false)}></div>
        </div>
      )}

      {/* ───────── UI HUD (Heads-Up Display) ปรับเปลี่ยนตามโหมด ───────── */}
      {gameState.isHoopPlaced && (
        <div className="absolute top-4 left-16 right-3 z-10 pointer-events-none flex justify-between items-start">
          {/* ข้อมูลพื้นฐานโหมด */}
          <div className="rounded-xl bg-black/60 backdrop-blur-sm border border-white/10 px-3 py-2 text-white font-mono text-xs flex flex-col gap-0.5">
            <span className="text-[10px] text-purple-400 font-black tracking-wide uppercase">
              {gameMode === "normal" && "🏆 Normal"}
              {gameMode === "fade" && "⚡ Fade & Teleport"}
              {gameMode === "multi" && "🔱 Multi-Hoop"}
              {gameMode === "wind" && "💨 Wind Challenge"}
              {gameMode === "time_attack" && "🔥 Time Attack"}
            </span>
            <div className="flex items-center gap-1.5 font-bold">
              {gameMode === "normal" && (
                <>
                  <span className="text-white/60">R{gameState.currentRound}/3</span>
                  <span className="text-white/30">|</span>
                </>
              )}
              <span className="text-amber-400 text-sm">{gameState.score} PTS</span>
              <span className="text-white/30">|</span>
              <span className="text-slate-300">
                {gameMode === "time_attack" ? "∞" : `${gameState.ballsLeft}`} 🏀
              </span>
            </div>
          </div>

          {/* แผงแสดงสถานะเพิ่มเติมของแต่ละโหมด */}
          <div className="flex flex-col items-end gap-1.5">
            {/* โหมดแวบหาย: แสดงเวลาถอยหลัง 3.5 วินาทีของห่วงปัจจุบัน */}
            {gameMode === "fade" && gameState.status === "idle" && (
              <div className="rounded-xl bg-black/70 backdrop-blur-sm border border-white/15 px-3 py-1.5 text-white font-mono text-xs flex items-center gap-1.5">
                <Timer className="h-3.5 w-3.5 text-amber-400 animate-pulse" />
                <span className="font-extrabold text-amber-400">
                  {gameState.timeLeft !== undefined ? gameState.timeLeft.toFixed(1) : "3.5"}s
                </span>
              </div>
            )}

            {/* โหมดจับเวลาบ้าคลั่ง: แสดงตัวเลขนับถอยหลังตัวโตๆ */}
            {gameMode === "time_attack" && (
              <div className="rounded-xl bg-red-600/80 border border-red-500/30 px-3 py-1.5 text-white font-mono text-xs flex items-center gap-1.5 shadow-lg">
                <Timer className="h-3.5 w-3.5 animate-spin" />
                <span className="font-black text-sm">
                  {gameState.timeLeft !== undefined ? gameState.timeLeft : "60"}s
                </span>
              </div>
            )}

            {/* โหมดแรงลม: แสดงทิศทางและความเร็วลม (Wind Widget) */}
            {gameMode === "wind" && gameState.windSpeed !== undefined && gameState.windSpeed > 0 && (
              <div className="rounded-xl bg-sky-900/60 backdrop-blur-sm border border-sky-400/20 px-3 py-1.5 text-white font-mono text-xs flex items-center gap-1.5">
                <Wind className="h-3.5 w-3.5 text-sky-300" />
                <span className="font-bold text-sky-200">
                  {gameState.windDirection === "right" ? "ลมพัดขวา →" : "← ลมพัดซ้าย"} {gameState.windSpeed} m/s
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ───────── ป้าย Combo ขนาดใหญ่ (สำหรับโหมด Time Attack) ───────── */}
      {gameMode === "time_attack" && gameState.combo !== undefined && gameState.combo > 0 && (
        <div className="absolute top-20 left-0 right-0 z-10 pointer-events-none flex justify-center animate-bounce">
          <div className="rounded-full bg-gradient-to-r from-amber-500 to-orange-600 border-2 border-white px-4 py-1 text-white font-extrabold text-xs shadow-lg tracking-wider font-mono">
            🔥 COMBO x{gameState.combo} (+{gameState.combo + 3}s)
          </div>
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
                <span className="text-xl font-extrabold italic tracking-widest text-white drop-shadow-[1px_1px_2px_rgba(0,0,0,0.8)]">
                  {gameMode === "time_attack" ? "ATTACK" : "GUEST"}
                </span>
                <div className="bg-[#0c0c0c] border border-[#222] rounded-lg px-2.5 py-1">
                  <span className="text-red-500 font-mono text-xs font-bold tracking-widest drop-shadow-[0_0_4px_rgba(239,68,68,0.9)]">
                    {gameMode === "time_attack" 
                      ? `00:${String(gameState.timeLeft || 0).padStart(2, "0")}`
                      : "01:00"
                    }
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

      {/* บอร์ดสรุปคะแนนหลังเล่นจบ */}
      {gameState.ballsLeft === 0 && gameState.status === "idle" && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md px-6">
          <div className="bg-slate-900 border border-white/10 rounded-3xl p-7 max-w-sm w-full text-center text-white shadow-2xl animate-in zoom-in-95 duration-200">
            <span className="text-4xl mb-2 block">🏆</span>
            <h2 className="text-2xl font-bold mb-1">สิ้นสุดการแข่งขัน</h2>
            <p className="text-slate-400 text-xs mb-5 font-mono">
              โหมดการเล่น: {" "}
              {gameMode === "normal" && "โหมดปกติ (Normal)"}
              {gameMode === "fade" && "โหมดแวบหาย (Fade)"}
              {gameMode === "multi" && "โหมดหลายแป้น (Multi-Hoop)"}
              {gameMode === "wind" && "โหมดแรงลม (Wind Challenge)"}
              {gameMode === "time_attack" && "โหมดจับเวลาบ้าคลั่ง (Time Attack)"}
            </p>

            <div className="bg-white/5 rounded-2xl p-4 border border-white/5 mb-6">
              <div className="text-sm text-slate-400 mb-1">คะแนนรวมสุทธิ</div>
              <div className="text-5xl font-black text-amber-400 font-mono leading-none mb-1">{gameState.score}</div>
              <div className="text-[10px] text-slate-500 font-sans">
                {gameMode === "time_attack" 
                  ? "หมดเวลา 60 วินาที" 
                  : "ยิงสำเร็จจากโอกาสทั้งหมดที่มี"
                }
              </div>
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
