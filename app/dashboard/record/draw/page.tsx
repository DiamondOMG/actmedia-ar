"use client";

import dynamic from "next/dynamic";

const MapEditorScene = dynamic(() => import("@/components/MapEditorScene"), {
  ssr: false,
  loading: () => (
    <div className="flex h-screen w-full items-center justify-center bg-slate-950 text-slate-400">
      กำลังโหลด Map Editor...
    </div>
  ),
});

export default function DrawPage() {
  return <MapEditorScene mode="draw" />;
}
