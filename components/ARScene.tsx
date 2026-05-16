"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { loadStoreData, StoreData } from "../lib/store-loader";
import { positionProvider } from "../lib/position-provider";
import { initScenePipelineModule } from "../lib/scene-init";
import { Menu, X, MapPin } from "lucide-react";

import * as THREE from "three";

declare const window: any;
declare const XR8: any;
declare const XRExtras: any;

export default function ARScene() {
  const containerRef = useRef<HTMLDivElement>(null);
  const searchParams = useSearchParams();
  const router = useRouter();
  
  const [storeData, setStoreData] = useState<StoreData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(true);
  const [selectedTarget, setSelectedTarget] = useState<any>(null);
  const [navInfo, setNavInfo] = useState<any>(null);
  const [trackingStatus, setTrackingStatus] = useState("NORMAL");
  const [xrStarted, setXrStarted] = useState(false);

  useEffect(() => {
    const storeId = searchParams.get("store");
    if (!storeId) {
      router.replace("/?store=demo_001");
      return;
    }

    let isMounted = true;
    loadStoreData(storeId)
      .then((data) => {
        if (!isMounted) return;
        setStoreData(data);
        if (data.initial_heading_deg) {
          positionProvider.setHeadingOffset(data.initial_heading_deg);
        }
      })
      .catch((err) => {
        console.error(err);
        if (isMounted) setError("ไม่พบข้อมูลห้าง กรุณาสแกน QR ใหม่อีกครั้ง");
      });

    return () => {
      isMounted = false;
    };
  }, [searchParams, router]);

  useEffect(() => {
    if (!storeData || xrStarted) return;

    const startAR = () => {
      if (typeof window === "undefined") return;
      if (typeof XR8 === "undefined" || typeof XRExtras === "undefined") {
        setTimeout(startAR, 500);
        return;
      }
      
      // สำคัญมาก: 8th Wall ต้องการให้ Three.js อยู่บน global window
      if (!window.THREE) {
        window.THREE = THREE;
      }
      
      setXrStarted(true);
      
      XR8.addCameraPipelineModules([
        XR8.GlTextureRenderer.pipelineModule(),
        XR8.Threejs.pipelineModule(),
        XR8.XrController.pipelineModule(),
        XRExtras.AlmostThere.pipelineModule(),
        XRExtras.Loading.pipelineModule(),
        XRExtras.RuntimeError.pipelineModule(),
        initScenePipelineModule(storeData),
      ]);

      XR8.run({ canvas: document.getElementById("camerafeed") as HTMLCanvasElement });
    };

    startAR();

    return () => {
      if (typeof XR8 !== "undefined" && xrStarted) {
        XR8.stop();
        XR8.clearCameraPipelineModules();
      }
    };
  }, [storeData, xrStarted]);

  useEffect(() => {
    if (!storeData) return;
    const interval = setInterval(() => {
      if (window.navDebug) setNavInfo({ ...window.navDebug });
    }, 100);

    const handleTracking = (e: any) => {
      if (e.detail && e.detail.status) setTrackingStatus(e.detail.status);
    };
    window.addEventListener("xrtrackingdetails", handleTracking);

    return () => {
      clearInterval(interval);
      window.removeEventListener("xrtrackingdetails", handleTracking);
    };
  }, [storeData]);

  const handleSelectTarget = (dest: any) => {
    setSelectedTarget(dest);
    window.navTargetId = dest.waypoint;
    setIsMenuOpen(false);
  };

  if (error) {
    return (
      <div className="fixed inset-0 bg-slate-900 flex flex-col items-center justify-center p-6 text-center font-sans z-[9999]">
        <div className="text-6xl mb-6">⚠️</div>
        <h1 className="text-2xl font-bold text-white mb-2">เกิดข้อผิดพลาด</h1>
        <p className="text-red-400 mb-8">{error}</p>
        <button onClick={() => window.location.reload()} className="px-8 py-3 bg-white text-slate-900 rounded-full font-bold shadow-lg">ลองใหม่อีกครั้ง</button>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="absolute inset-0 w-full h-full bg-black overflow-hidden">
      <canvas id="camerafeed"></canvas>
      
      {!xrStarted && (
        <div className="absolute inset-0 flex items-center justify-center text-white pointer-events-none z-10">
          <span className="bg-black/50 px-4 py-2 rounded-lg">กำลังเปิดกล้อง AR...</span>
        </div>
      )}

      {storeData && (
        <div className="absolute inset-0 pointer-events-none font-sans z-[100]">
          <div className="absolute top-0 left-0 right-0 p-4 pointer-events-auto flex justify-between items-start">
            {selectedTarget && !isMenuOpen ? (
              <div className="bg-black/60 backdrop-blur-md rounded-2xl px-4 py-2 border border-white/10 shadow-lg flex flex-col items-center mt-2">
                 <span className="text-[10px] uppercase tracking-widest text-purple-300 font-bold">{storeData.store_name}</span>
                 <span className="text-white font-bold text-lg">{selectedTarget.name}</span>
              </div>
            ) : <div />}

            <button 
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="bg-black/80 backdrop-blur-md p-3 rounded-full text-white shadow-xl border border-white/20 mt-2 active:scale-95 transition-transform"
            >
              {isMenuOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
          </div>

          {trackingStatus !== 'NORMAL' && !navInfo?.isArrived && !isMenuOpen && (
            <div className="absolute top-24 left-6 right-6 bg-red-500/90 text-white p-4 rounded-2xl shadow-2xl backdrop-blur-md animate-pulse border border-red-400 pointer-events-auto">
              <div className="flex items-center space-x-3">
                <div className="text-3xl">📱</div>
                <div className="text-left">
                  <div className="font-bold text-lg">กำลังค้นหาพื้นที่...</div>
                  <div className="text-sm opacity-90">กรุณายกมือถือขึ้นส่องไปรอบๆ บริเวณทางเดิน</div>
                </div>
              </div>
            </div>
          )}

          {selectedTarget && navInfo && !isMenuOpen && (
            <div className="absolute bottom-10 left-6 right-6 pointer-events-auto">
              <div className={`p-6 rounded-3xl backdrop-blur-xl shadow-2xl border border-white/20 transition-all ${
                navInfo.isArrived ? 'bg-green-500/90' : 'bg-slate-900/80'
              }`}>
                {navInfo.isArrived ? (
                  <div className="text-center py-2 animate-bounce">
                    <div className="text-4xl mb-2">🏁</div>
                    <h2 className="text-2xl font-bold text-white">ยินดีด้วย! คุณถึงที่หมายแล้ว</h2>
                    <button 
                      onClick={() => { setSelectedTarget(null); setIsMenuOpen(true) }}
                      className="mt-4 px-6 py-2 bg-white text-green-600 rounded-full font-bold"
                    >
                      เลือกร้านอื่น
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center space-x-4">
                    <div className="bg-purple-500 p-4 rounded-2xl shadow-lg shadow-purple-500/50">
                      <MapPin className="text-white animate-pulse" size={32} />
                    </div>
                    <div className="flex-1">
                      <div className="text-xs text-slate-400 uppercase tracking-tighter">ระยะทางที่เหลือ</div>
                      <div className="text-3xl font-black text-white">{navInfo.distance} <span className="text-lg font-normal">เมตร</span></div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          <div className={`absolute inset-0 bg-slate-900/95 backdrop-blur-xl pointer-events-auto transition-transform duration-300 ease-in-out flex flex-col ${
            isMenuOpen ? 'translate-y-0 opacity-100' : 'translate-y-full opacity-0'
          }`}>
            <div className="p-6 mt-16 overflow-y-auto pb-24">
              <h2 className="text-2xl font-bold text-white mb-6">เลือกร้านปลายทาง 🎯</h2>
              <div className="grid grid-cols-1 gap-3">
                {storeData?.destinations?.map((dest: any) => (
                  <button
                    key={dest.waypoint}
                    onClick={() => handleSelectTarget(dest)}
                    className={`flex items-center p-4 rounded-2xl transition-all border-2 text-left ${
                      selectedTarget?.waypoint === dest.waypoint
                        ? 'bg-purple-600/30 border-purple-500 ring-2 ring-purple-500/50'
                        : 'bg-slate-800 border-slate-700 active:bg-slate-700'
                    }`}
                  >
                    <span className="text-3xl mr-4">{dest.icon || '🏪'}</span>
                    <div className="flex-1">
                      <div className="font-bold text-lg text-white">{dest.name}</div>
                      <div className="text-xs opacity-60 text-slate-300 uppercase">{dest.description || `จุดหมาย: ${dest.waypoint}`}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
