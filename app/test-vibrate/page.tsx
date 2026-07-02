"use client";

import { useState, useEffect } from "react";
import { ArrowLeft, Trash2, Smartphone, HelpCircle } from "lucide-react";
import { useRouter } from "next/navigation";

interface LogEntry {
  time: string;
  message: string;
  type: "info" | "success" | "warning" | "error";
}

export default function TestVibratePage() {
  const router = useRouter();
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isSupported, setIsSupported] = useState<boolean | null>(null);
  const [delayTimer, setDelayTimer] = useState<NodeJS.Timeout | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);

  useEffect(() => {
    if (typeof navigator !== "undefined") {
      setIsSupported(!!navigator.vibrate);
      addLog(
        navigator.vibrate
          ? "Vibration API พร้อมใช้งานบนอุปกรณ์นี้"
          : "Vibration API ไม่รองรับบนอุปกรณ์/เบราว์เซอร์นี้",
        navigator.vibrate ? "success" : "error"
      );
    }
    return () => {
      if (delayTimer) clearTimeout(delayTimer);
    };
  }, []);

  const addLog = (message: string, type: LogEntry["type"] = "info") => {
    const now = new Date();
    const timeStr = now.toTimeString().split(" ")[0] + "." + String(now.getMilliseconds()).padStart(3, "0");
    setLogs((prev) => [{ time: timeStr, message, type }, ...prev]);
  };

  const triggerVibrate = (duration: number = 1000, label: string) => {
    if (typeof navigator === "undefined" || !navigator.vibrate) {
      addLog(`[${label}] ล้มเหลว: ไม่รองรับ Vibration API`, "error");
      return;
    }

    try {
      const result = navigator.vibrate(duration);
      if (result) {
        addLog(`[${label}] สั่งสั่นสำเร็จ (ผลลัพธ์ API: true)`, "success");
      } else {
        addLog(`[${label}] เบราว์เซอร์ปฏิเสธคำสั่งสั่น (ผลลัพธ์ API: false)`, "warning");
      }
    } catch (err: any) {
      addLog(`[${label}] เกิดข้อผิดพลาด: ${err.message || err}`, "error");
    }
  };

  // 1. กดแล้วสั่นทันที (Pointer Down)
  const handlePointerDown = () => {
    addLog("ตรวจจับการกดปุ่ม (PointerDown) - เริ่มสั่งสั่น 1 วินาที", "info");
    triggerVibrate(1000, "1. กดแล้วสั่น");
  };

  // 2. ปล่อยนิ้วสั่นทันที (Pointer Up)
  const handlePointerUp = () => {
    addLog("ตรวจจับการปล่อยปุ่ม (PointerUp) - เริ่มสั่งสั่น 1 วินาที", "info");
    triggerVibrate(1000, "2. ปล่อยแล้วสั่น");
  };

  // 3. ปล่อยนิ้วแล้วหน่วงเวลา 3 วินาที (Pointer Up + Timeout 3s)
  const handlePointerUpDelay = () => {
    if (delayTimer) clearTimeout(delayTimer);
    
    addLog("ตรวจจับการปล่อยปุ่ม (PointerUp) - กำลังนับถอยหลัง 3 วินาที...", "info");
    setCountdown(3);

    let count = 3;
    const interval = setInterval(() => {
      count -= 1;
      if (count > 0) {
        setCountdown(count);
      } else {
        clearInterval(interval);
        setCountdown(null);
      }
    }, 1000);

    const timer = setTimeout(() => {
      addLog("ครบ 3 วินาที (Timeout) - เริ่มสั่งสั่น 1 วินาที", "info");
      triggerVibrate(1000, "3. ปล่อยแล้วหน่วง 3 วิ");
    }, 3000);

    setDelayTimer(timer);
  };

  const clearLogs = () => {
    setLogs([]);
    addLog("ล้างประวัติการทำงานแล้ว", "info");
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white font-sans p-6 flex flex-col">
      {/* Header */}
      <header className="mb-6 flex items-center justify-between">
        <button
          onClick={() => router.back()}
          className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900 border border-white/10 hover:bg-slate-800 transition"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="text-xl font-bold flex items-center gap-2">
          <Smartphone className="h-5 w-5 text-purple-400" />
          ระบบทดสอบการสั่น (Haptics)
        </h1>
        <div className="w-10"></div>
      </header>

      {/* Support Badge */}
      <div className="mb-6 rounded-2xl bg-slate-900/60 border border-white/10 p-4 flex items-center justify-between">
        <span className="text-sm text-slate-400">สถานะอุปกรณ์ของคุณ:</span>
        {isSupported === null ? (
          <span className="text-xs font-semibold px-3 py-1 rounded-full bg-slate-800 text-slate-400">กำลังตรวจสอบ...</span>
        ) : isSupported ? (
          <span className="text-xs font-bold px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">✓ รองรับระบบสั่น</span>
        ) : (
          <span className="text-xs font-bold px-3 py-1 rounded-full bg-rose-500/20 text-rose-400 border border-rose-500/30">✗ ไม่รองรับระบบสั่น</span>
        )}
      </div>

      {/* Test Buttons Container */}
      <div className="grid gap-4 mb-8">
        {/* Button 1: Press Immediately */}
        <div className="bg-slate-900 border border-white/5 rounded-2xl p-4 flex flex-col gap-2">
          <h3 className="text-sm font-semibold text-slate-300">แบบที่ 1: กดปุ่มแล้วสั่นทันที</h3>
          <p className="text-xs text-slate-500 leading-relaxed mb-1">
            สั่นเมื่อใช้นิ้วแตะลงบนปุ่มทันที (Event: PointerDown / TouchStart)
          </p>
          <button
            onPointerDown={handlePointerDown}
            className="w-full py-4 bg-purple-600 hover:bg-purple-500 active:scale-98 font-bold text-white rounded-xl transition duration-150 shadow-lg shadow-purple-600/10 text-center select-none touch-none"
          >
            กดปุ่มนี้เพื่อสั่นทันที (1 วินาที)
          </button>
        </div>

        {/* Button 2: Release to Vibrate */}
        <div className="bg-slate-900 border border-white/5 rounded-2xl p-4 flex flex-col gap-2">
          <h3 className="text-sm font-semibold text-slate-300">แบบที่ 2: ปล่อยนิ้วแล้วสั่นทันที</h3>
          <p className="text-xs text-slate-500 leading-relaxed mb-1">
            สั่นเมื่อยกนิ้วออกจากปุ่ม (Event: PointerUp / TouchEnd)
          </p>
          <button
            onPointerUp={handlePointerUp}
            className="w-full py-4 bg-emerald-600 hover:bg-emerald-500 active:scale-98 font-bold text-white rounded-xl transition duration-150 shadow-lg shadow-emerald-600/10 text-center select-none touch-none"
          >
            ปล่อยนิ้วตรงนี้เพื่อเริ่มสั่น (1 วินาที)
          </button>
        </div>

        {/* Button 3: Release and Delay 3s */}
        <div className="bg-slate-900 border border-white/5 rounded-2xl p-4 flex flex-col gap-2">
          <h3 className="text-sm font-semibold text-slate-300">
            แบบที่ 3: ปล่อยนิ้วแล้วรอ 3 วินาทีถึงสั่น
          </h3>
          <p className="text-xs text-slate-500 leading-relaxed mb-1">
            จำลองสถานการณ์ยิงบาสลงห่วง (ยกนิ้วปัดชู้ต -&gt; รอ 3 วินาทีเพื่อให้ลูกลง -&gt; ค่อยสั่งสั่น)
          </p>
          <button
            onPointerUp={handlePointerUpDelay}
            className="relative w-full py-4 bg-amber-600 hover:bg-amber-500 active:scale-98 font-bold text-white rounded-xl transition duration-150 shadow-lg shadow-amber-600/10 text-center select-none touch-none overflow-hidden"
          >
            {countdown !== null ? (
              <span className="absolute inset-0 flex items-center justify-center bg-amber-700 text-lg font-black animate-pulse">
                ⏳ สั่นในอีก {countdown}...
              </span>
            ) : null}
            ปล่อยนิ้วตรงนี้ (หน่วง 3 วินาทีแล้วสั่น 1 วินาที)
          </button>
        </div>
      </div>

      {/* Console Logs */}
      <div className="flex-1 bg-black/40 border border-white/10 rounded-2xl p-4 flex flex-col min-h-[220px]">
        <div className="flex items-center justify-between mb-3 border-b border-white/5 pb-2">
          <h2 className="text-xs font-bold text-slate-400 font-mono tracking-wider">
            LOGS / ผลการทำงาน
          </h2>
          <button
            onClick={clearLogs}
            className="text-slate-500 hover:text-white transition flex items-center gap-1 text-[10px]"
          >
            <Trash2 className="h-3 w-3" />
            ล้าง log
          </button>
        </div>
        <div className="flex-1 overflow-y-auto max-h-[250px] font-mono text-[10px] flex flex-col gap-1.5 scrollbar-thin select-text">
          {logs.length === 0 ? (
            <div className="text-slate-600 text-center py-8">ไม่มีประวัติการคลิกทดสอบ</div>
          ) : (
            logs.map((log, index) => (
              <div
                key={index}
                className={`py-1 px-2 rounded-md ${
                  log.type === "success"
                    ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/10"
                    : log.type === "warning"
                      ? "bg-amber-500/10 text-amber-400 border border-amber-500/10"
                      : log.type === "error"
                        ? "bg-rose-500/10 text-rose-400 border border-rose-500/10"
                        : "text-slate-300"
                }`}
              >
                <span className="text-slate-500 mr-2">[{log.time}]</span>
                {log.message}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Troubleshooting Guide */}
      <div className="mt-6 p-4 rounded-xl bg-slate-900/40 border border-white/5 text-xs text-slate-400">
        <h4 className="font-bold text-slate-300 flex items-center gap-1.5 mb-2">
          <HelpCircle className="h-4 w-4 text-purple-400" />
          ไม่สั่น? วิธีแก้ไขเบื้องต้นบน Android:
        </h4>
        <ol className="list-decimal pl-4 space-y-1 text-slate-400 leading-relaxed">
          <li>ตรวจสอบว่าโทรศัพท์ไม่ได้อยู่ใน <b>โหมดประหยัดพลังงาน</b> (Battery Saver) ซึ่งจะปิดสั่นสัมผัส</li>
          <li>ตรวจสอบว่าเสียงโทรศัพท์ไม่ได้ตั้งเป็น <b>โหมดเงียบ (Silent)</b> หรือ <b>ห้ามรบกวน (DND)</b></li>
          <li>ตรวจสอบการตั้งค่า Android: <code className="bg-black/30 px-1 rounded text-slate-300">ตั้งค่า &gt; เสียงและการสั่น &gt; เปิดระบบสั่นเมื่อสัมผัส (Touch Vibration / Haptic Feedback)</code></li>
          <li>หากเปิดในแอปแชท (เช่น LINE หรือ Facebook) แนะนำให้คัดลอกลิงก์มาเปิดโดยตรงในแอป <b>Google Chrome</b> หรือ <b>Microsoft Edge</b></li>
        </ol>
      </div>
    </div>
  );
}
