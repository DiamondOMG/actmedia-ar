import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { Navigation, LogIn, UserPlus, ArrowRight, MapPin, Compass, Layers } from "lucide-react";
import NavbarUser from "@/components/NavbarUser";

export default async function Home() {
  const { userId } = await auth();

  return (
    <div className="min-h-screen bg-slate-950 text-white overflow-auto">
      {/* ───────── Navbar ───────── */}
      <nav className="fixed top-0 left-0 right-0 z-50 border-b border-white/10 bg-slate-950/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 text-lg font-bold tracking-tight">
            <Navigation className="h-5 w-5 text-purple-400" />
            <span>AR Navigate</span>
          </Link>

          {/* Menu */}
          <div className="flex items-center gap-3">
            {userId ? (
              <>
                <Link
                  href="/dashboard"
                  className="rounded-lg px-4 py-2 text-sm font-medium text-slate-300 transition hover:bg-white/5 hover:text-white"
                >
                  Dashboard
                </Link>
                <NavbarUser />
              </>
            ) : (
              <>
                <Link
                  href="/sign-in"
                  className="flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium text-slate-300 transition hover:bg-white/5 hover:text-white"
                >
                  <LogIn className="h-4 w-4" />
                  Sign In
                </Link>
                <Link
                  href="/sign-up"
                  className="flex items-center gap-1.5 rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-purple-500"
                >
                  <UserPlus className="h-4 w-4" />
                  Sign Up
                </Link>
              </>
            )}
          </div>
        </div>
      </nav>

      {/* ───────── Hero Section ───────── */}
      <section className="relative flex min-h-screen flex-col items-center justify-center px-6 pt-16">
        {/* Glow Background */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute left-1/2 top-1/3 h-[500px] w-[500px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-purple-600/20 blur-[120px]" />
          <div className="absolute right-1/4 bottom-1/4 h-[300px] w-[300px] rounded-full bg-indigo-600/15 blur-[100px]" />
        </div>

        <div className="relative z-10 mx-auto max-w-3xl text-center">
          {/* Badge */}
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-purple-500/30 bg-purple-500/10 px-4 py-1.5 text-sm text-purple-300">
            <Compass className="h-4 w-4" />
            WebAR In-Store Navigation
          </div>

          {/* Heading */}
          <h1 className="mb-6 text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl md:text-6xl">
            นำทางในห้าง
            <br />
            <span className="bg-gradient-to-r from-purple-400 via-violet-400 to-indigo-400 bg-clip-text text-transparent">
              ด้วย AR บนมือถือ
            </span>
          </h1>

          {/* Subtitle */}
          <p className="mb-10 text-lg leading-relaxed text-slate-400 sm:text-xl">
            ระบบนำทางภายในอาคารแบบ Augmented Reality
            <br className="hidden sm:inline" />
            ไม่ต้องติดตั้งแอป เปิดกล้องแล้วเดินตามลูกศรได้ทันที
          </p>

          {/* CTA Buttons */}
          <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            {userId ? (
              <Link
                href="/dashboard"
                className="group flex items-center gap-2 rounded-xl bg-purple-600 px-8 py-3.5 text-base font-semibold text-white shadow-lg shadow-purple-600/25 transition hover:bg-purple-500 hover:shadow-purple-500/30"
              >
                เข้าสู่ Dashboard
                <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
              </Link>
            ) : (
              <Link
                href="/dashboard"
                className="group flex items-center gap-2 rounded-xl bg-purple-600 px-8 py-3.5 text-base font-semibold text-white shadow-lg shadow-purple-600/25 transition hover:bg-purple-500 hover:shadow-purple-500/30"
              >
                เริ่มต้นใช้งาน
                <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
              </Link>
            )}
            <Link
              href="/ar?store=demo_001"
              className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-8 py-3.5 text-base font-medium text-slate-300 transition hover:bg-white/10 hover:text-white"
            >
              <MapPin className="h-4 w-4" />
              ทดลองเปิด AR
            </Link>
          </div>
        </div>
      </section>

      {/* ───────── Features Section ───────── */}
      <section className="relative border-t border-white/5 bg-slate-900/50 px-6 py-24">
        <div className="mx-auto max-w-5xl">
          <h2 className="mb-4 text-center text-3xl font-bold tracking-tight">
            ทำไมต้อง AR Navigate?
          </h2>
          <p className="mx-auto mb-16 max-w-xl text-center text-slate-400">
            เปลี่ยนประสบการณ์การเดินห้างของลูกค้า ด้วยเทคโนโลยี WebAR ที่ทำงานผ่านเบราว์เซอร์ได้ทันที
          </p>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {/* Card 1 */}
            <div className="group rounded-2xl border border-white/5 bg-white/[0.02] p-6 transition hover:border-purple-500/30 hover:bg-white/[0.04]">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-purple-500/10 text-purple-400 transition group-hover:bg-purple-500/20">
                <Compass className="h-6 w-6" />
              </div>
              <h3 className="mb-2 text-lg font-semibold">SLAM Navigation</h3>
              <p className="text-sm leading-relaxed text-slate-400">
                ใช้เทคโนโลยี 8th Wall SLAM ในการติดตามตำแหน่งผู้ใช้แบบ Real-time โดยไม่ต้องใช้อุปกรณ์เซ็นเซอร์เพิ่มเติม
              </p>
            </div>

            {/* Card 2 */}
            <div className="group rounded-2xl border border-white/5 bg-white/[0.02] p-6 transition hover:border-purple-500/30 hover:bg-white/[0.04]">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-400 transition group-hover:bg-indigo-500/20">
                <MapPin className="h-6 w-6" />
              </div>
              <h3 className="mb-2 text-lg font-semibold">A* Pathfinding</h3>
              <p className="text-sm leading-relaxed text-slate-400">
                คำนวณเส้นทางที่สั้นที่สุดจากจุดเริ่มต้นถึงปลายทาง ด้วยอัลกอริทึม A* ที่ทำงานได้รวดเร็วบนมือถือ
              </p>
            </div>

            {/* Card 3 */}
            <div className="group rounded-2xl border border-white/5 bg-white/[0.02] p-6 transition hover:border-purple-500/30 hover:bg-white/[0.04]">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-violet-500/10 text-violet-400 transition group-hover:bg-violet-500/20">
                <Layers className="h-6 w-6" />
              </div>
              <h3 className="mb-2 text-lg font-semibold">ไม่ต้องติดตั้งแอป</h3>
              <p className="text-sm leading-relaxed text-slate-400">
                ลูกค้าแค่สแกน QR Code จากหน้าห้าง เปิดเบราว์เซอร์ก็เริ่มนำทางได้ทันที ลดอุปสรรคในการเข้าถึง
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ───────── Footer ───────── */}
      <footer className="border-t border-white/5 px-6 py-8">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <p className="text-sm text-slate-500">
            © {new Date().getFullYear()} AR Navigate — Powered by 8th Wall & Next.js
          </p>
          <div className="flex items-center gap-1 text-sm text-slate-500">
            <Navigation className="h-3.5 w-3.5" />
            <span>DiamondOMG</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
