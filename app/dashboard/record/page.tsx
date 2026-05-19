"use client";

import dynamic from "next/dynamic";

// โหลด ARRecordScene เฉพาะฝั่ง Client ป้องกัน SSR Error-
const ARRecordScene = dynamic(() => import("@/components/ARRecordScene"), {
  ssr: false,
  loading: () => (
    <div className="flex h-screen w-full flex-col items-center justify-center bg-slate-950 text-white font-sans">
      <div className="relative mb-6">
        <div className="h-16 w-16 rounded-full border-4 border-purple-500/20" />
        <div className="absolute inset-0 h-16 w-16 rounded-full border-4 border-transparent border-t-purple-500 animate-spin" />
      </div>
      <p className="text-lg font-semibold text-white mb-1">กำลังโหลดหน้าบันทึก AR...</p>
      <p className="text-sm text-slate-400">กรุณาใช้อุปกรณ์ที่รองรับกล้อง</p>
    </div>
  ),
});

export default function RecordPage() {
  return (
    <main className="relative h-screen w-screen overflow-hidden bg-black">
      <ARRecordScene />
    </main>
  );
}
