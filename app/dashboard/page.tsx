import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import NavbarUser from "../../components/NavbarUser";
import { Navigation, Plus, Map, Settings, BarChart3 } from "lucide-react";

export default async function DashboardPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const user = await currentUser();
  const displayName = user?.firstName || user?.emailAddresses?.[0]?.emailAddress || "User";

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {/* ───────── Navbar ───────── */}
      <nav className="fixed top-0 left-0 right-0 z-50 border-b border-white/10 bg-slate-950/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2 text-lg font-bold tracking-tight">
            <Navigation className="h-5 w-5 text-purple-400" />
            <span>AR Navigate</span>
          </Link>
          <div className="flex items-center gap-3">
            <NavbarUser />
          </div>
        </div>
      </nav>

      {/* ───────── Main Content ───────── */}
      <main className="mx-auto max-w-6xl px-6 pt-24 pb-16">
        {/* Welcome Header */}
        <div className="mb-10">
          <h1 className="text-3xl font-bold tracking-tight">
            สวัสดี, {displayName} 👋
          </h1>
          <p className="mt-2 text-slate-400">จัดการแผนที่นำทาง AR ของคุณ</p>
        </div>

        {/* Quick Actions */}
        <div className="mb-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {/* Create New Map */}
          <button className="group flex items-center gap-4 rounded-2xl border-2 border-dashed border-purple-500/30 bg-purple-500/5 p-6 text-left transition hover:border-purple-500/50 hover:bg-purple-500/10">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-purple-500/20 text-purple-400 transition group-hover:bg-purple-500/30">
              <Plus className="h-6 w-6" />
            </div>
            <div>
              <div className="font-semibold text-white">สร้างแผนที่ใหม่</div>
              <div className="text-sm text-slate-400">เพิ่ม Waypoints และเส้นทางนำทาง</div>
            </div>
          </button>

          {/* Stats Card */}
          <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-6">
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-400">
              <BarChart3 className="h-5 w-5" />
            </div>
            <div className="text-2xl font-bold">0</div>
            <div className="text-sm text-slate-400">แผนที่ทั้งหมด</div>
          </div>

          {/* Settings */}
          <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-6">
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-slate-500/10 text-slate-400">
              <Settings className="h-5 w-5" />
            </div>
            <div className="text-2xl font-bold">—</div>
            <div className="text-sm text-slate-400">ตั้งค่าบัญชี</div>
          </div>
        </div>

        {/* Map List (Empty State) */}
        <div>
          <h2 className="mb-4 text-xl font-bold">แผนที่ของคุณ</h2>
          <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-12 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-800">
              <Map className="h-8 w-8 text-slate-500" />
            </div>
            <h3 className="mb-2 text-lg font-semibold text-slate-300">ยังไม่มีแผนที่</h3>
            <p className="mb-6 text-sm text-slate-500">
              เริ่มต้นสร้างแผนที่นำทาง AR แรกของคุณ<br />
              ปักหมุด Waypoints, กำหนดเส้นทาง และเซฟลง Database
            </p>
            <button className="inline-flex items-center gap-2 rounded-xl bg-purple-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-purple-600/25 transition hover:bg-purple-500">
              <Plus className="h-4 w-4" />
              สร้างแผนที่แรก
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
