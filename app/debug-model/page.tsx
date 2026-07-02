"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { ArrowLeft, RefreshCw, Eye, EyeOff } from "lucide-react";
import { useRouter } from "next/navigation";

export default function DebugModelPage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const router = useRouter();

  // สถานะสำหรับ UI
  const [modelPath, setModelPath] = useState<string>("/basketball/basketball_classic_standard_ball.glb");
  const [scale, setScale] = useState<number>(0.005);
  const [rotationSpeed, setRotationSpeed] = useState<number>(0.2);
  const [autoRotate, setAutoRotate] = useState<boolean>(true);
  const [showHelper, setShowHelper] = useState<boolean>(true);
  
  // ข้อมูลวิเคราะห์โมเดล
  const [modelInfo, setModelInfo] = useState<{
    status: string;
    fileName: string;
    nodeCount: number;
    size: string;
    center: string;
  }>({
    status: "กำลังเตรียมฉาก...",
    fileName: "ยังไม่ได้โหลด",
    nodeCount: 0,
    size: "N/A",
    center: "N/A",
  });

  // ตัวแปร Three.js
  const sceneRef = useRef<THREE.Scene | null>(null);
  const modelRef = useRef<THREE.Object3D | null>(null);
  const helperRef = useRef<THREE.BoxHelper | null>(null);
  const axesRef = useRef<THREE.AxesHelper | null>(null);

  // เอฟเฟกต์โหลด Three.js และเริ่มระบบ
  useEffect(() => {
    if (!canvasRef.current) return;

    // 1. สร้าง Scene, Camera, Renderer
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0f1d);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(
      45,
      canvasRef.current.clientWidth / canvasRef.current.clientHeight,
      0.01,
      1000
    );
    camera.position.set(0, 2, 5);

    const renderer = new THREE.WebGLRenderer({
      canvas: canvasRef.current,
      antialias: true,
    });
    renderer.setSize(canvasRef.current.clientWidth, canvasRef.current.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;

    // 2. แสงสว่าง (Lighting)
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1.0);
    dirLight.position.set(5, 10, 5);
    dirLight.castShadow = true;
    scene.add(dirLight);

    const dirLight2 = new THREE.DirectionalLight(0x90b0ff, 0.4);
    dirLight2.position.set(-5, 5, -5);
    scene.add(dirLight2);

    // 3. Grid และ Axes Helpers
    const gridHelper = new THREE.GridHelper(10, 50, 0x4f46e5, 0x1e293b);
    gridHelper.position.y = -0.5;
    scene.add(gridHelper);

    const axes = new THREE.AxesHelper(2);
    axes.position.set(0, 0, 0);
    scene.add(axes);
    axesRef.current = axes;

    // 4. Orbit Controls (คุมกล้องหมุน/ซูม)
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.maxDistance = 50;
    controls.minDistance = 0.1;

    // 5. ลูป Render
    const clock = new THREE.Clock();
    let animationId: number;

    const animate = () => {
      animationId = requestAnimationFrame(animate);

      const dt = clock.getDelta();

      if (modelRef.current && autoRotate) {
        modelRef.current.rotateY(rotationSpeed * dt);
      }

      controls.update();
      renderer.render(scene, camera);
    };

    animate();

    // จัดการ Resize
    const handleResize = () => {
      if (!canvasRef.current) return;
      camera.aspect = canvasRef.current.clientWidth / canvasRef.current.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(canvasRef.current.clientWidth, canvasRef.current.clientHeight);
    };
    window.addEventListener("resize", handleResize);

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener("resize", handleResize);
      renderer.dispose();
    };
  }, []);

  // เอฟเฟกต์โหลดโมเดลตามเส้นทางและสเกลที่เปลี่ยน
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    // ล้างโมเดลเก่าก่อนโหลดใหม่
    if (modelRef.current) {
      scene.remove(modelRef.current);
      modelRef.current = null;
    }
    if (helperRef.current) {
      scene.remove(helperRef.current);
      helperRef.current = null;
    }

    setModelInfo((prev) => ({ ...prev, status: "กำลังโหลดโมเดล..." }));

    const loader = new GLTFLoader();
    loader.load(
      modelPath,
      (gltf) => {
        const loadedModel = gltf.scene;
        modelRef.current = loadedModel;

        // อัปเดตสเกลตาม State
        loadedModel.scale.setScalar(scale);
        loadedModel.position.set(0, 0, 0);

        scene.add(loadedModel);

        // นับจำนวน Node
        let nodes = 0;
        loadedModel.traverse(() => {
          nodes += 1;
        });

        // คำนวณ Bounding Box ของโมเดลจริงที่ถูกโหลดมาในระบบ (หลังสเกล)
        const box = new THREE.Box3().setFromObject(loadedModel);
        const size = new THREE.Vector3();
        box.getSize(size);
        const center = new THREE.Vector3();
        box.getCenter(center);

        setModelInfo({
          status: "โหลดสำเร็จแล้ว",
          fileName: modelPath.split("/").pop() || "",
          nodeCount: nodes,
          size: `W=${size.x.toFixed(4)}, H=${size.y.toFixed(4)}, D=${size.z.toFixed(4)}`,
          center: `[${center.x.toFixed(3)}, ${center.y.toFixed(3)}, ${center.z.toFixed(3)}]`,
        });

        // สร้าง Box Helper ครอบโมเดล
        const boxHelper = new THREE.BoxHelper(loadedModel, 0xef4444);
        boxHelper.visible = showHelper;
        scene.add(boxHelper);
        helperRef.current = boxHelper;
      },
      undefined,
      (err) => {
        console.error("Error loading model in debug page:", err);
        const error_msg = err instanceof Error ? err.message : "ไม่สามารถโหลดไฟล์ได้";
        setModelInfo((prev) => ({
          ...prev,
          status: `เกิดข้อผิดพลาด: ${error_msg}`,
        }));
      }
    );
  }, [modelPath]);

  // ซิงค์สเกลโมเดลสดๆ
  useEffect(() => {
    if (modelRef.current) {
      modelRef.current.scale.setScalar(scale);
      
      // อัปเดต Box Helper
      if (helperRef.current) {
        helperRef.current.update();
      }

      // คำนวณขนาดและจุดศูนย์กลางใหม่หลังอัปเดตสเกล
      const box = new THREE.Box3().setFromObject(modelRef.current);
      const size = new THREE.Vector3();
      box.getSize(size);
      const center = new THREE.Vector3();
      box.getCenter(center);

      setModelInfo((prev) => ({
        ...prev,
        size: `W=${size.x.toFixed(4)}, H=${size.y.toFixed(4)}, D=${size.z.toFixed(4)}`,
        center: `[${center.x.toFixed(3)}, ${center.y.toFixed(3)}, ${center.z.toFixed(3)}]`,
      }));
    }
  }, [scale]);

  // ซิงค์การแสดงผลของ Helper และแกนพิกัด
  useEffect(() => {
    if (helperRef.current) {
      helperRef.current.visible = showHelper;
    }
    if (axesRef.current) {
      axesRef.current.visible = showHelper;
    }
  }, [showHelper]);

  return (
    <div className="min-h-screen bg-slate-950 text-white font-sans flex flex-col md:flex-row">
      
      {/* 3D Canvas Viewport */}
      <div ref={containerRef} className="flex-1 relative h-[50vh] md:h-screen min-h-[300px]">
        <canvas ref={canvasRef} className="w-full h-full block" />
        
        {/* Overlays */}
        <button
          onClick={() => router.back()}
          className="absolute top-4 left-4 z-10 flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900/80 border border-white/10 hover:bg-slate-800 transition backdrop-blur-sm"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>

        <div className="absolute top-4 right-4 z-10 bg-slate-900/80 border border-white/10 px-3 py-1.5 rounded-lg text-xs font-mono backdrop-blur-sm flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
          Three.js Scene Active
        </div>

        {/* Axes Info Overlay */}
        <div className="absolute bottom-4 left-4 z-10 bg-slate-900/80 border border-white/10 p-3 rounded-xl text-[10px] font-mono backdrop-blur-sm flex flex-col gap-1 text-slate-400">
          <span className="font-bold text-slate-300 mb-0.5">แกนพิกัดอ้างอิง (Axes Helper)</span>
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-red-500" /> แกน X (บวก = ขวา)</span>
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-green-500" /> แกน Y (บวก = บน)</span>
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-blue-500" /> แกน Z (บวก = เข้าหาตัว)</span>
        </div>
      </div>

      {/* Control Panel Sidebar */}
      <div className="w-full md:w-[380px] bg-slate-900/40 border-t md:border-t-0 md:border-l border-white/10 p-6 flex flex-col justify-between max-h-[50vh] md:max-h-screen overflow-y-auto">
        <div>
          <h1 className="text-xl font-bold mb-1 flex items-center gap-2">
            🔍 เครื่องมือดีบักโมเดล 3D
          </h1>
          <p className="text-xs text-slate-400 mb-6">วิเคราะห์สเกล, ขนาดจริง และ Origin Point ของไฟล์โมเดล</p>

          {/* Model Selector */}
          <div className="mb-6">
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
              เลือกไฟล์โมเดล
            </label>
            <div className="grid gap-2">
              <button
                onClick={() => {
                  setModelPath("/basketball/basketball_classic_standard_ball.glb");
                  setScale(0.005); // ตั้งค่าสเกลเริ่มต้นตัวใหม่
                }}
                className={`py-2 px-3 rounded-lg text-left text-xs font-semibold border transition ${
                  modelPath.includes("basketball_classic_standard_ball")
                    ? "bg-purple-600/20 border-purple-500 text-white"
                    : "bg-slate-800/40 border-white/5 text-slate-400 hover:text-white"
                }`}
              >
                🏀 ลูกบาสใหม่ (basketball_classic_standard_ball.glb)
              </button>
              <button
                onClick={() => {
                  setModelPath("/3d/throwing/basketball.glb");
                  setScale(0.062); // ตั้งค่าสเกลเริ่มต้นตัวเก่า
                }}
                className={`py-2 px-3 rounded-lg text-left text-xs font-semibold border transition ${
                  modelPath.includes("3d/throwing")
                    ? "bg-purple-600/20 border-purple-500 text-white"
                    : "bg-slate-800/40 border-white/5 text-slate-400 hover:text-white"
                }`}
              >
                🏀 ลูกบาสเก่า (basketball.glb)
              </button>
            </div>
          </div>

          {/* Scale Control Slider */}
          <div className="mb-6">
            <div className="flex items-center justify-between text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
              <span>สเกลโมเดล (Scale)</span>
              <span className="font-mono text-purple-400">{scale.toFixed(6)}</span>
            </div>
            <input
              type="range"
              min="0.0001"
              max="0.2"
              step="0.0001"
              value={scale}
              onChange={(e) => setScale(parseFloat(e.target.value))}
              className="w-full accent-purple-500 bg-slate-800 rounded-lg appearance-none h-1.5 cursor-pointer mb-2"
            />
            {/* Quick Presets */}
            <div className="flex gap-2">
              <button
                onClick={() => setScale(0.005)}
                className="text-[10px] px-2 py-0.5 bg-slate-800 rounded text-slate-300 hover:text-white"
              >
                0.005 (สเกลลูกใหม่)
              </button>
              <button
                onClick={() => setScale(0.062)}
                className="text-[10px] px-2 py-0.5 bg-slate-800 rounded text-slate-300 hover:text-white"
              >
                0.062 (สเกลลูกเก่า)
              </button>
              <button
                onClick={() => setScale(0.01)}
                className="text-[10px] px-2 py-0.5 bg-slate-800 rounded text-slate-300 hover:text-white"
              >
                0.01
              </button>
            </div>
          </div>

          {/* Helpers & Display Settings */}
          <div className="mb-6">
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
              การแสดงผลช่วยสอน
            </label>
            <div className="flex items-center justify-between py-2 border-b border-white/5 text-xs">
              <span className="text-slate-300 flex items-center gap-1.5">
                {showHelper ? <Eye className="h-4 w-4 text-purple-400" /> : <EyeOff className="h-4 w-4 text-slate-600" />}
                แสดง Bounding Box และแกนพิกัด
              </span>
              <input
                type="checkbox"
                checked={showHelper}
                onChange={(e) => setShowHelper(e.target.checked)}
                className="rounded text-purple-600 focus:ring-purple-500 h-4 w-4 bg-slate-800 border-white/10"
              />
            </div>
            <div className="flex items-center justify-between py-2 border-b border-white/5 text-xs">
              <span className="text-slate-300">หมุนอัตโนมัติ (Auto-Rotate)</span>
              <input
                type="checkbox"
                checked={autoRotate}
                onChange={(e) => setAutoRotate(e.target.checked)}
                className="rounded text-purple-600 focus:ring-purple-500 h-4 w-4 bg-slate-800 border-white/10"
              />
            </div>
          </div>
        </div>

        {/* Model Analysis Summary */}
        <div className="bg-black/40 border border-white/10 rounded-2xl p-4 font-mono text-[10px]">
          <h4 className="text-slate-400 font-bold uppercase tracking-wider mb-3 pb-1 border-b border-white/5 flex items-center justify-between">
            <span>ผลการวิเคราะห์ไฟล์ 3D</span>
            <RefreshCw className="h-3 w-3 animate-spin text-purple-400" />
          </h4>
          <div className="space-y-2">
            <div>
              <span className="text-slate-500">สถานะ:</span>{" "}
              <span className={modelInfo.status.includes("สำเร็จ") ? "text-emerald-400" : "text-amber-400 font-semibold"}>
                {modelInfo.status}
              </span>
            </div>
            <div>
              <span className="text-slate-500">ชื่อไฟล์:</span>{" "}
              <span className="text-slate-300">{modelInfo.fileName}</span>
            </div>
            <div>
              <span className="text-slate-500">จำนวน Nodes ทั้งหมด:</span>{" "}
              <span className="text-slate-300">{modelInfo.nodeCount} nodes</span>
            </div>
            <div>
              <span className="text-slate-500">ขนาด Bounding Box (หลังคูณสเกล):</span>{" "}
              <span className="text-purple-400 font-bold block mt-0.5">{modelInfo.size} เมตร</span>
            </div>
            <div>
              <span className="text-slate-500">จุดศูนย์กลางโมเดล (Center):</span>{" "}
              <span className="text-amber-400 block mt-0.5">{modelInfo.center}</span>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
