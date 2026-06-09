"use client";

import dynamic from "next/dynamic";

// โหลด ARCalibrateScene เฉพาะฝั่ง Client ป้องกัน SSR error (window is not defined)
const ARCalibrateScene = dynamic(() => import("../../../components/ARCalibrateScene"), {
  ssr: false,
  loading: () => (
    <div className="flex h-screen w-full items-center justify-center bg-black text-white">
      กำลังเปิดกล้อง...
    </div>
  ),
});

export default function ARCalibratePage() {
  return (
    <main className="relative h-screen w-screen overflow-hidden bg-black">
      <ARCalibrateScene />
    </main>
  );
}
