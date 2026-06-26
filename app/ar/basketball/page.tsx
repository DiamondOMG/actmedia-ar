"use client";

import dynamic from "next/dynamic";

// โหลด BasketballScene เฉพาะฝั่ง Client ป้องกัน SSR error (window is not defined)
const BasketballScene = dynamic(() => import("@/components/ar-basketball/basketball_scene"), {
  ssr: false,
  loading: () => (
    <div className="flex h-screen w-full items-center justify-center bg-black text-white font-sans">
      กำลังเปิดกล้อง AR บาสเกตบอล...
    </div>
  ),
});

export default function BasketballPage() {
  return (
    <main className="h-screen w-screen overflow-hidden">
      <BasketballScene />
    </main>
  );
}
