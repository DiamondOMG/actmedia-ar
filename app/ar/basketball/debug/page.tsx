"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import Link from "next/link";

export default function DebugBasketballPage() {
  const container_ref = useRef<HTMLDivElement>(null);

  // React state for the loaded model object to trigger reactive updates
  const [model, set_model] = useState<THREE.Group | null>(null);

  // State for model adjustments (syncs bidirectionally with TransformControls)
  const [model_scale, set_model_scale] = useState(0.8774);
  const [model_x, set_model_x] = useState(0.0);
  const [model_y, set_model_y] = useState(0.0);
  const [model_z, set_model_z] = useState(0.0);
  const [model_rx, set_model_rx] = useState(0.0);
  const [model_ry, set_model_ry] = useState(0.0);
  const [model_rz, set_model_rz] = useState(0.0);

  // Transform Controls Mode: 'translate' | 'rotate' | 'scale'
  const [transform_mode, set_transform_mode] = useState<"translate" | "rotate" | "scale">("translate");

  // State for hitboxes (from physics configurations)
  const [ring_radius, set_ring_radius] = useState(0.28);
  const [ring_offset_y, set_ring_offset_y] = useState(0.1);
  const [ring_offset_z, set_ring_offset_z] = useState(0.35);

  const [board_width, set_board_width] = useState(1.2);
  const [board_height, set_board_height] = useState(0.8);
  const [board_offset_y, set_board_offset_y] = useState(0.4);
  const [board_offset_z, set_board_offset_z] = useState(0.015);

  // References for keeping track of Three.js instances inside useEffect
  const scene_ref = useRef<THREE.Scene | null>(null);
  const ring_helper_ref = useRef<THREE.Mesh | null>(null);
  const board_helper_ref = useRef<THREE.Mesh | null>(null);
  const transform_controls_ref = useRef<any>(null);
  const orbit_controls_ref = useRef<any>(null);

  // Status and Hierarchy
  const [load_status, set_load_status] = useState("Loading GLB Model...");
  const [found_ring_name, set_found_ring_name] = useState<string | null>(null);
  const [model_hierarchy, set_model_hierarchy] = useState<string[]>([]);

  const safe_val = (val: number, fallback = 0) => {
    return isNaN(val) || val === null || val === undefined ? fallback : val;
  };

  useEffect(() => {
    if (!container_ref.current) return;

    let is_mounted = true;
    let animation_frame_id: number;
    let renderer: THREE.WebGLRenderer;
    let scene: THREE.Scene;
    let camera: THREE.PerspectiveCamera;
    let orbit_controls: any;
    let transform_controls: any;

    // Load OrbitControls and TransformControls dynamically to prevent Next.js SSR type mismatch
    Promise.all([
      import("three/examples/jsm/controls/OrbitControls.js"),
      import("three/examples/jsm/controls/TransformControls.js"),
      import("three/examples/jsm/loaders/GLTFLoader.js")
    ]).then(([{ OrbitControls }, { TransformControls }, { GLTFLoader }]) => {
      if (!is_mounted || !container_ref.current) return;

      const width = container_ref.current.clientWidth;
      const height = container_ref.current.clientHeight;

      scene = new THREE.Scene();
      scene.background = new THREE.Color(0x111113);
      scene_ref.current = scene;

      camera = new THREE.PerspectiveCamera(60, width / height, 0.01, 10);
      camera.position.set(0, 1.2, 2.0);

      renderer = new THREE.WebGLRenderer({ antialias: true });
      renderer.setSize(width, height);
      renderer.shadowMap.enabled = true;
      container_ref.current.appendChild(renderer.domElement);

      // Orbit Controls
      orbit_controls = new OrbitControls(camera, renderer.domElement);
      orbit_controls.enableDamping = true;
      orbit_controls.dampingFactor = 0.05;
      orbit_controls.target.set(0, 0.3, 0.2);
      orbit_controls_ref.current = orbit_controls;

      // Helpers
      const grid_helper = new THREE.GridHelper(5, 50, 0x333338, 0x222225);
      grid_helper.position.y = -0.1;
      scene.add(grid_helper);

      const axes_helper = new THREE.AxesHelper(1);
      axes_helper.position.set(-1.5, 0, 0);
      scene.add(axes_helper);

      // Lights
      const ambient_light = new THREE.AmbientLight(0xffffff, 1.2);
      scene.add(ambient_light);

      const dir_light = new THREE.DirectionalLight(0xffffff, 1.0);
      dir_light.position.set(2, 4, 3);
      dir_light.castShadow = true;
      scene.add(dir_light);

      const point_light = new THREE.PointLight(0xffffff, 1.0, 5);
      point_light.position.set(0, 0.5, 1);
      scene.add(point_light);

      // Fan-shaped Backboard (Visual Reference)
      const board_shape = new THREE.Shape();
      board_shape.moveTo(-0.5, 0);
      board_shape.lineTo(0.5, 0);
      board_shape.quadraticCurveTo(0.6, 0, 0.6, 0.1);
      board_shape.lineTo(0.6, 0.35);
      board_shape.absarc(0, 0.35, 0.6, 0, Math.PI, false);
      board_shape.lineTo(-0.6, 0.1);
      board_shape.quadraticCurveTo(-0.6, 0, -0.5, 0);

      const extrude_settings = {
        depth: 0.03,
        bevelEnabled: true,
        bevelSegments: 2,
        steps: 1,
        bevelSize: 0.005,
        bevelThickness: 0.005,
      };
      const board_geo = new THREE.ExtrudeGeometry(board_shape, extrude_settings);

      // Canvas texture for orange square
      const tex_canvas = document.createElement("canvas");
      tex_canvas.width = 512;
      tex_canvas.height = 384;
      const ctx = tex_canvas.getContext("2d");
      if (ctx) {
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, 512, 384);
        ctx.strokeStyle = "#ff5500";
        ctx.lineWidth = 14;
        const rect_w = 192;
        const rect_h = 140;
        const rect_x = (512 - rect_w) / 2;
        const rect_y = 384 - 55 - rect_h;
        ctx.strokeRect(rect_x, rect_y, rect_w, rect_h);
      }
      const board_texture = new THREE.CanvasTexture(tex_canvas);
      
      const front_mat = new THREE.MeshStandardMaterial({
        map: board_texture,
        roughness: 0.5,
        metalness: 0.1,
      });
      const side_mat = new THREE.MeshStandardMaterial({
        color: 0xcccccc,
        roughness: 0.6,
      });
      
      // SWAPPED: index 0 is sides, index 1 is caps
      const board_mesh = new THREE.Mesh(board_geo, [side_mat, front_mat]);
      board_mesh.position.set(0, 0, 0);
      scene.add(board_mesh);

      // Ring Hitbox Helper (Green wireframe)
      const ring_helper_geo = new THREE.TorusGeometry(ring_radius, 0.01, 8, 24);
      const ring_helper_mat = new THREE.MeshBasicMaterial({
        color: 0x00ff00,
        wireframe: true,
        transparent: true,
        opacity: 0.8,
      });
      const ring_helper = new THREE.Mesh(ring_helper_geo, ring_helper_mat);
      ring_helper.rotation.x = Math.PI / 2;
      ring_helper.position.set(0, ring_offset_y, ring_offset_z);
      scene.add(ring_helper);
      ring_helper_ref.current = ring_helper;

      // Board Hitbox Helper (Red wireframe box)
      const board_helper_geo = new THREE.BoxGeometry(board_width, board_height, 0.03);
      const board_helper_mat = new THREE.MeshBasicMaterial({
        color: 0xff0000,
        wireframe: true,
        transparent: true,
        opacity: 0.5,
      });
      const board_helper = new THREE.Mesh(board_helper_geo, board_helper_mat);
      board_helper.position.set(0, board_offset_y, board_offset_z);
      scene.add(board_helper);
      board_helper_ref.current = board_helper;

      // Transform Controls (3D Gizmo for dragging/scaling/rotating)
      transform_controls = new TransformControls(camera, renderer.domElement);
      scene.add(transform_controls.getHelper());
      transform_controls_ref.current = transform_controls;

      // Disable orbit controls while dragging gizmo
      transform_controls.addEventListener("dragging-changed", (event: any) => {
        orbit_controls.enabled = !event.value;
      });

      // Load Default GLB Model
      const loader = new GLTFLoader();
      loader.load(
        "/basketball/basketball hoop 3d model (2).glb",
        (gltf) => {
          if (!is_mounted) return;
          const loaded_model = gltf.scene;
          
          loaded_model.traverse((child: any) => {
            if (child.isMesh) {
              child.castShadow = true;
              child.receiveShadow = true;
              if (child.material) {
                child.material.side = THREE.DoubleSide;
                child.material.needsUpdate = true;
              }
            }
          });

          scene.add(loaded_model);
          set_model(loaded_model);
          transform_controls.attach(loaded_model);

          set_load_status("Model Loaded successfully!");

          const hierarchy_list: string[] = [];
          loaded_model.traverse((child: any) => {
            if (child.isMesh) {
              hierarchy_list.push(`Mesh: "${child.name}"`);
            } else {
              hierarchy_list.push(`Group/Node: "${child.name}"`);
            }
          });
          set_model_hierarchy(hierarchy_list);

          // Auto align
          setTimeout(() => {
            auto_align_internal(loaded_model);
          }, 100);
        },
        undefined,
        (err) => {
          console.error(err);
          set_load_status("Default GLB not found. Use Uploader.");
        }
      );

      // Animation Loop
      const animate = () => {
        if (!is_mounted) return;
        animation_frame_id = requestAnimationFrame(animate);
        orbit_controls.update();
        renderer.render(scene, camera);
      };
      animate();
    });

    // Resize Handler
    const handle_resize = () => {
      if (!container_ref.current || !camera || !renderer) return;
      const w = container_ref.current.clientWidth;
      const h = container_ref.current.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener("resize", handle_resize);

    // Cleanup
    return () => {
      is_mounted = false;
      cancelAnimationFrame(animation_frame_id);
      window.removeEventListener("resize", handle_resize);
      if (container_ref.current && renderer && renderer.domElement) {
        container_ref.current.removeChild(renderer.domElement);
      }
      if (scene) scene.clear();
    };
  }, []);

  // Update Transform Controls Mode
  useEffect(() => {
    if (transform_controls_ref.current) {
      transform_controls_ref.current.setMode(transform_mode);
    }
  }, [transform_mode]);

  // Sync state changes -> 3D Model
  useEffect(() => {
    if (model) {
      model.scale.setScalar(model_scale);
      model.position.set(model_x, model_y, model_z);
      model.rotation.set(
        model_rx * (Math.PI / 180),
        model_ry * (Math.PI / 180),
        model_rz * (Math.PI / 180)
      );
    }
  }, [model, model_scale, model_x, model_y, model_z, model_rx, model_ry, model_rz]);

  // Listener to sync 3D Model changes (via TransformControls dragging) -> React State
  useEffect(() => {
    if (!transform_controls_ref.current) return;

    const handle_change = () => {
      if (model) {
        set_model_x(Number(model.position.x.toFixed(4)));
        set_model_y(Number(model.position.y.toFixed(4)));
        set_model_z(Number(model.position.z.toFixed(4)));

        set_model_rx(Number((model.rotation.x * (180 / Math.PI)).toFixed(1)));
        set_model_ry(Number((model.rotation.y * (180 / Math.PI)).toFixed(1)));
        set_model_rz(Number((model.rotation.z * (180 / Math.PI)).toFixed(1)));

        set_model_scale(Number(model.scale.x.toFixed(4)));
      }
    };

    transform_controls_ref.current.addEventListener("objectChange", handle_change);
    return () => {
      transform_controls_ref.current?.removeEventListener("objectChange", handle_change);
    };
  }, [model]);

  // Update hitbox helpers
  useEffect(() => {
    if (ring_helper_ref.current) {
      ring_helper_ref.current.geometry.dispose();
      ring_helper_ref.current.geometry = new THREE.TorusGeometry(ring_radius, 0.01, 8, 24);
      ring_helper_ref.current.position.set(0, ring_offset_y, ring_offset_z);
    }
  }, [ring_radius, ring_offset_y, ring_offset_z]);

  useEffect(() => {
    if (board_helper_ref.current) {
      board_helper_ref.current.geometry.dispose();
      board_helper_ref.current.geometry = new THREE.BoxGeometry(board_width, board_height, 0.03);
      board_helper_ref.current.position.set(0, board_offset_y, board_offset_z);
    }
  }, [board_width, board_height, board_offset_y, board_offset_z]);

  // File Upload Handler (Load user's custom GLB dynamically)
  const handle_file_upload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const contents = event.target?.result as ArrayBuffer;
      
      // Load GLTFLoader dynamically
      const { GLTFLoader } = await import("three/examples/jsm/loaders/GLTFLoader.js");
      const loader = new GLTFLoader();
      
      loader.parse(
        contents,
        "",
        (gltf) => {
          // Remove old model
          if (model && scene_ref.current) {
            scene_ref.current.remove(model);
          }
          
          const loaded_model = gltf.scene;
          
          // Force DoubleSide materials
          loaded_model.traverse((child: any) => {
            if (child.isMesh) {
              child.castShadow = true;
              child.receiveShadow = true;
              if (child.material) {
                child.material.side = THREE.DoubleSide;
                child.material.needsUpdate = true;
              }
            }
          });

          if (scene_ref.current) {
            scene_ref.current.add(loaded_model);
          }
          
          set_model(loaded_model);
          
          if (transform_controls_ref.current) {
            transform_controls_ref.current.attach(loaded_model);
          }
          
          set_load_status(`Uploaded: ${file.name}`);

          const hierarchy_list: string[] = [];
          loaded_model.traverse((child: any) => {
            if (child.isMesh) {
              hierarchy_list.push(`Mesh: "${child.name}"`);
            } else {
              hierarchy_list.push(`Group/Node: "${child.name}"`);
            }
          });
          set_model_hierarchy(hierarchy_list);

          // Auto align
          setTimeout(() => {
            auto_align_internal(loaded_model);
          }, 100);
        },
        (err) => {
          console.error(err);
          set_load_status("Failed to parse uploaded GLB file.");
        }
      );
    };
    reader.readAsArrayBuffer(file);
  };

  // Internal auto align logic
  const auto_align_internal = (target_model: THREE.Group) => {
    target_model.rotation.set(0, 0, 0);
    target_model.scale.set(1, 1, 1);
    target_model.position.set(0, 0, 0);

    const bounding_box = new THREE.Box3().setFromObject(target_model);
    const box_size = new THREE.Vector3();
    bounding_box.getSize(box_size);

    const target_width = ring_radius * 2;
    const computed_scale = target_width / box_size.x;
    set_model_scale(computed_scale);
    target_model.scale.setScalar(computed_scale);

    let ring_mesh: THREE.Object3D | null = null;
    target_model.traverse((child: any) => {
      if (child.isMesh && (
        child.name.toLowerCase().includes('ring') ||
        child.name.toLowerCase().includes('rim') ||
        child.name.toLowerCase().includes('torus') ||
        child.name.toLowerCase().includes('hoop')
      )) {
        ring_mesh = child;
      }
    });

    const scaled_box = new THREE.Box3().setFromObject(target_model);
    const scaled_center = new THREE.Vector3();
    scaled_box.getCenter(scaled_center);
    const scaled_size = new THREE.Vector3();
    scaled_box.getSize(scaled_size);

    let final_x = -scaled_center.x;
    let final_y = 0;
    let final_z = 0;

    if (ring_mesh) {
      const ring_box = new THREE.Box3().setFromObject(ring_mesh);
      const ring_center = new THREE.Vector3();
      ring_box.getCenter(ring_center);
      set_found_ring_name((ring_mesh as any).name);

      final_x += (0 - ring_center.x);
      final_y = (ring_offset_y - ring_center.y);
      final_z = (ring_offset_z - ring_center.z);
    } else {
      set_found_ring_name("Not found (using fallback)");
      final_z = ring_offset_z - (scaled_box.min.z + 0.38);
      final_y = ring_offset_y - (scaled_box.min.y + scaled_size.y * 0.7);
    }

    set_model_x(Number(final_x.toFixed(4)));
    set_model_y(Number(final_y.toFixed(4)));
    set_model_z(Number(final_z.toFixed(4)));
  };

  const trigger_auto_align = () => {
    if (model) {
      auto_align_internal(model);
    }
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-zinc-950 font-sans text-zinc-100">
      {/* 3D Canvas Container */}
      <div className="relative flex-1 h-full w-full" ref={container_ref}>
        {/* Top Info Bar */}
        <div className="absolute top-4 left-4 z-10 flex flex-col gap-2 rounded-lg bg-zinc-900/90 p-4 border border-zinc-800 backdrop-blur-md max-w-sm pointer-events-auto">
          <h1 className="text-sm font-bold text-orange-500">AR Basketball Hoop Alignment Tool</h1>
          <p className="text-[11px] text-zinc-400">
            Green Torus = Ring Hitbox | Red Box = Backboard Hitbox.
          </p>
          <div className="flex items-center gap-2 mt-1">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span className="text-[11px] font-medium">{load_status}</span>
          </div>
          {found_ring_name && (
            <p className="text-[11px] text-orange-300">
              Matched Ring: <span className="font-mono">{found_ring_name}</span>
            </p>
          )}

          {/* Gizmo Mode Switcher */}
          <div className="flex gap-1 mt-2 border-t border-zinc-800 pt-2">
            <button
              onClick={() => set_transform_mode("translate")}
              className={`flex-1 rounded py-1 text-[10px] font-semibold transition cursor-pointer ${
                transform_mode === "translate" ? "bg-orange-600 text-white" : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
              }`}
            >
              Translate
            </button>
            <button
              onClick={() => set_transform_mode("rotate")}
              className={`flex-1 rounded py-1 text-[10px] font-semibold transition cursor-pointer ${
                transform_mode === "rotate" ? "bg-orange-600 text-white" : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
              }`}
            >
              Rotate
            </button>
            <button
              onClick={() => set_transform_mode("scale")}
              className={`flex-1 rounded py-1 text-[10px] font-semibold transition cursor-pointer ${
                transform_mode === "scale" ? "bg-orange-600 text-white" : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
              }`}
            >
              Scale
            </button>
          </div>
          <p className="text-[9px] text-zinc-500 mt-1">
            Tip: Click and drag the arrows on the 3D model to move it directly!
          </p>
        </div>
      </div>

      {/* Control Panel Sidebar */}
      <div className="w-96 border-l border-zinc-800 bg-zinc-900 flex flex-col overflow-y-auto pointer-events-auto">
        <div className="p-6 flex flex-col gap-6">
          {/* Uploader Section */}
          <div className="flex flex-col gap-2 bg-zinc-950 p-4 rounded-lg border border-zinc-850">
            <h3 className="text-xs font-bold text-orange-400 uppercase tracking-wider">Upload Custom Model</h3>
            <p className="text-[10px] text-zinc-400">Select any local .glb file to align it to the hitboxes.</p>
            <input
              type="file"
              accept=".glb,.gltf"
              onChange={handle_file_upload}
              className="mt-1 block w-full text-xs text-zinc-400
                file:mr-4 file:py-1.5 file:px-3
                file:rounded file:border-0
                file:text-xs file:font-semibold
                file:bg-orange-600 file:text-white
                file:cursor-pointer hover:file:bg-orange-500 transition"
            />
          </div>

          <div className="flex justify-between items-center border-t border-zinc-800 pt-4">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Model Adjustment</h2>
            <button
              onClick={trigger_auto_align}
              className="rounded bg-orange-600 hover:bg-orange-500 px-3 py-1.5 text-xs font-semibold transition cursor-pointer"
            >
              Auto Align Model
            </button>
          </div>

          {/* Model Offset Settings */}
          <div className="flex flex-col gap-4">
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span>Scale Factor</span>
                <span className="font-mono text-orange-400">{safe_val(model_scale).toFixed(4)}</span>
              </div>
              <input
                type="range"
                min="0.05"
                max="2.5"
                step="0.0001"
                value={safe_val(model_scale)}
                onChange={(e) => set_model_scale(parseFloat(e.target.value))}
                className="w-full accent-orange-500 cursor-pointer"
              />
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1">
                <span>Offset X</span>
                <span className="font-mono text-orange-400">{safe_val(model_x).toFixed(4)}m</span>
              </div>
              <input
                type="range"
                min="-1.5"
                max="1.5"
                step="0.0001"
                value={safe_val(model_x)}
                onChange={(e) => set_model_x(parseFloat(e.target.value))}
                className="w-full accent-orange-500 cursor-pointer"
              />
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1">
                <span>Offset Y</span>
                <span className="font-mono text-orange-400">{safe_val(model_y).toFixed(4)}m</span>
              </div>
              <input
                type="range"
                min="-1.5"
                max="1.5"
                step="0.0001"
                value={safe_val(model_y)}
                onChange={(e) => set_model_y(parseFloat(e.target.value))}
                className="w-full accent-orange-500 cursor-pointer"
              />
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1">
                <span>Offset Z</span>
                <span className="font-mono text-orange-400">{safe_val(model_z).toFixed(4)}m</span>
              </div>
              <input
                type="range"
                min="-1.5"
                max="1.5"
                step="0.0001"
                value={safe_val(model_z)}
                onChange={(e) => set_model_z(parseFloat(e.target.value))}
                className="w-full accent-orange-500 cursor-pointer"
              />
            </div>

            <div className="border-t border-zinc-800 my-2"></div>

            <div>
              <div className="flex justify-between text-xs mb-1">
                <span>Rotation X (pitch)</span>
                <span className="font-mono text-orange-400">{safe_val(model_rx).toFixed(1)}°</span>
              </div>
              <input
                type="range"
                min="-180"
                max="180"
                step="0.1"
                value={safe_val(model_rx)}
                onChange={(e) => set_model_rx(parseFloat(e.target.value))}
                className="w-full accent-orange-500 cursor-pointer"
              />
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1">
                <span>Rotation Y (yaw)</span>
                <span className="font-mono text-orange-400">{safe_val(model_ry).toFixed(1)}°</span>
              </div>
              <input
                type="range"
                min="-180"
                max="180"
                step="0.1"
                value={safe_val(model_ry)}
                onChange={(e) => set_model_ry(parseFloat(e.target.value))}
                className="w-full accent-orange-500 cursor-pointer"
              />
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1">
                <span>Rotation Z (roll)</span>
                <span className="font-mono text-orange-400">{safe_val(model_rz).toFixed(1)}°</span>
              </div>
              <input
                type="range"
                min="-180"
                max="180"
                step="0.1"
                value={safe_val(model_rz)}
                onChange={(e) => set_model_rz(parseFloat(e.target.value))}
                className="w-full accent-orange-500 cursor-pointer"
              />
            </div>
          </div>

          <div className="border-t border-zinc-800 my-2"></div>

          {/* Hitbox Config */}
          <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Physics Hitbox Reference</h2>
          
          <div className="flex flex-col gap-4 text-xs">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-zinc-500">Ring Radius</label>
                <input
                  type="number"
                  step="0.01"
                  value={ring_radius}
                  onChange={(e) => set_ring_radius(parseFloat(e.target.value) || 0)}
                  className="mt-1 w-full rounded border border-zinc-700 bg-zinc-950 p-1.5 font-mono text-orange-400 focus:outline-none focus:border-orange-500"
                />
              </div>
              <div>
                <label className="text-zinc-500">Ring Offset Y</label>
                <input
                  type="number"
                  step="0.01"
                  value={ring_offset_y}
                  onChange={(e) => set_ring_offset_y(parseFloat(e.target.value) || 0)}
                  className="mt-1 w-full rounded border border-zinc-700 bg-zinc-950 p-1.5 font-mono text-orange-400 focus:outline-none focus:border-orange-500"
                />
              </div>
            </div>
            <div>
              <label className="text-zinc-500">Ring Offset Z</label>
              <input
                type="number"
                step="0.01"
                value={ring_offset_z}
                onChange={(e) => set_ring_offset_z(parseFloat(e.target.value) || 0)}
                className="mt-1 w-full rounded border border-zinc-700 bg-zinc-950 p-1.5 font-mono text-orange-400 focus:outline-none focus:border-orange-500"
              />
            </div>
          </div>

          <div className="border-t border-zinc-800 my-2"></div>

          {/* Hierarchy Info */}
          <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">GLB Model Nodes ({model_hierarchy.length})</h2>
          <div className="max-h-32 overflow-y-auto border border-zinc-855 bg-zinc-950 p-2 rounded text-[10px] font-mono text-zinc-400 flex flex-col gap-1">
            {model_hierarchy.length > 0 ? (
              model_hierarchy.map((node, index) => <div key={index}>{node}</div>)
            ) : (
              <div>No nodes scanned.</div>
            )}
          </div>

          <div className="border-t border-zinc-800 my-2"></div>

          {/* Code Output */}
          <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Export Parameters</h2>
          
          <div className="flex flex-col gap-2">
            <p className="text-[11px] text-zinc-400">
              Apply these values to <code className="font-mono text-orange-400">setup_loaded_hoop()</code>:
            </p>
            <textarea
              readOnly
              value={`// Adjustments configured from Debug tool
const scale_factor = ${model_scale.toFixed(6)};
loaded_hoop.scale.setScalar(scale_factor);

// Offset parameters
loaded_hoop.position.set(${model_x.toFixed(4)}, ${model_y.toFixed(4)}, ${model_z.toFixed(4)});
${model_rx !== 0 || model_ry !== 0 || model_rz !== 0 ? `loaded_hoop.rotation.set(${model_rx} * Math.PI / 180, ${model_ry} * Math.PI / 180, ${model_rz} * Math.PI / 180);\n` : ""}`}
              className="h-32 w-full rounded border border-zinc-800 bg-zinc-950 p-3 font-mono text-xs text-emerald-400 focus:outline-none"
            />
          </div>

          <Link href="/ar/basketball" className="mt-4 flex items-center justify-center rounded bg-zinc-800 hover:bg-zinc-700 text-xs py-2 text-zinc-300 transition">
            ← Back to AR Basketball
          </Link>
        </div>
      </div>
    </div>
  );
}
