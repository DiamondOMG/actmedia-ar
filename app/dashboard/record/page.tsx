import Link from "next/link";
import { ArrowLeft, Footprints, Pencil, FileImage } from "lucide-react";

export default function RecordModePage() {
  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto max-w-lg px-6 py-10">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white transition mb-8"
        >
          <ArrowLeft className="h-4 w-4" /> Dashboard
        </Link>

        <h1 className="text-2xl font-bold mb-2">สร้างแผนที่ใหม่</h1>
        <p className="text-slate-400 mb-8">เลือกวิธีสร้าง</p>

        <div className="grid gap-4">
          {/* Walk Record (AR) */}
          <Link
            href="/dashboard/record/walk"
            className="group flex items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.02] p-6 transition hover:border-purple-500/40 hover:bg-purple-500/5"
          >
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-purple-500/20 text-purple-400 transition group-hover:bg-purple-500/30">
              <Footprints className="h-6 w-6" />
            </div>
            <div>
              <div className="font-semibold text-white">🚶 เดินเก็บ (Walk Record)</div>
              <div className="text-sm text-slate-400">เปิดกล้อง AR แล้วเดินปัก Waypoint จริง</div>
            </div>
          </Link>

          {/* Draw */}
          <Link
            href="/dashboard/record/draw"
            className="group flex items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.02] p-6 transition hover:border-indigo-500/40 hover:bg-indigo-500/5"
          >
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-indigo-500/20 text-indigo-400 transition group-hover:bg-indigo-500/30">
              <Pencil className="h-6 w-6" />
            </div>
            <div>
              <div className="font-semibold text-white">✏️ วาดเส้นทาง (Draw)</div>
              <div className="text-sm text-slate-400">ลากเส้นบน Canvas สร้างแผนที่บนจอ</div>
            </div>
          </Link>

          {/* Blueprint */}
          <Link
            href="/dashboard/record/blueprint"
            className="group flex items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.02] p-6 transition hover:border-cyan-500/40 hover:bg-cyan-500/5"
          >
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-cyan-500/20 text-cyan-400 transition group-hover:bg-cyan-500/30">
              <FileImage className="h-6 w-6" />
            </div>
            <div>
              <div className="font-semibold text-white">📄 แปลนอาคาร (Blueprint)</div>
              <div className="text-sm text-slate-400">อัปโหลด PDF / รูปแปลน แล้วลากเส้นทับ</div>
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
}
