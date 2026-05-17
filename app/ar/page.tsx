"use client";

import dynamic from "next/dynamic";

// โหลด ARScene เฉพาะฝั่ง Client เพื่อป้องกัน SSR Error (window is not defined)
const ARScene = dynamic(() => import("../../components/ARScene"), {
  ssr: false,
  loading: () => (
    <div className="flex h-screen w-full items-center justify-center bg-black text-white">
      กำลังเปิดกล้อง...
    </div>
  ),
});

export default function ARPage() {
  return (
    <main className="relative h-screen w-screen overflow-hidden bg-black">
      {/* AR Canvas (รันเฉพาะ Client พร้อม UI ในตัว) */}
      <ARScene />
    </main>
  );
}
