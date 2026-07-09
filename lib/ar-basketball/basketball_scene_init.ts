import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

declare const XR8: any;

export interface GameState {
  score: number;
  ballsLeft: number;
  status: 'idle' | 'aiming' | 'thrown' | 'scored' | 'missed';
  isHoopPlaced?: boolean;
  isDeviceAligned?: boolean;
  currentRound?: number;
  isAssetLoaded?: boolean;
  assetLoadProgress?: number;
}

export const initBasketballScenePipelineModule = (onStateChange: (state: Partial<GameState>) => void) => {
  let scene: THREE.Scene;
  let hoopGroup: THREE.Group;
  let trajectoryPoints: THREE.Mesh[] = [];
  const clock = new THREE.Clock();

  // ตัวแปรด้านการควบคุมฟิสิกส์และสถานะเกม
  let ballMesh: THREE.Object3D | null = null;
  let ballModelTemplate: THREE.Object3D | null = null; // preloaded GLB
  const ballVelocity = new THREE.Vector3();
  let isBallThrown = false;
  let isHoopPlaced = false;
  let isHoopModelLoaded = false;

  // ระบบทัวร์นาเมนต์ 3 รอบ
  let currentRound = 1;
  let score = 0;       // คะแนนสะสมทั้งหมด
  let ballsLeft = 3;   // โอกาสโยนในรอบปัจจุบัน

  let hasScoredThisThrow = false;
  let canScore = false; // ตรวจสอบว่าผ่านห่วงจากบนลงล่างเท่านั้น

  // ponytail: variables for flick-to-shoot dragging state and velocity tracking in Camera-Local Space to prevent AR camera jitter
  let isDragging = false;
  const startDragPosLocal = new THREE.Vector3();
  const currentDragPosLocal = new THREE.Vector3();
  const expectedVelocity = new THREE.Vector3();

  // ponytail: anti-jitter freeze — lock ball position if finger stays still > 2s
  // ceiling: uses screen-pixel deadzone (3px), upgrade to adaptive threshold if needed
  let lastTouchScreenX = 0;
  let lastTouchScreenY = 0;
  let lastSignificantMoveTime = 0;
  let frozenWorldPos: THREE.Vector3 | null = null;
  let frozenVelocity: THREE.Vector3 | null = null;

  const getProjectedPosition = (clientX: number, clientY: number, activeCamera: THREE.Camera): THREE.Vector3 => {
    const ndc = new THREE.Vector2(
      (clientX / window.innerWidth) * 2 - 1,
      -(clientY / window.innerHeight) * 2 + 1
    );

    const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(activeCamera.quaternion);
    const coplanarPoint = new THREE.Vector3(0, -0.15, -0.4).applyQuaternion(activeCamera.quaternion).add(activeCamera.position);
    
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(normal, coplanarPoint);
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(ndc, activeCamera);
    
    const targetPos = new THREE.Vector3();
    raycaster.ray.intersectPlane(plane, targetPos);
    return targetPos;
  };

  const calculateExpectedVelocity = (activeCamera: THREE.Camera) => {
    // คำนวณหา displacement ในพิกัด Local ได้โดยตรงเลย เพื่อไม่ให้ขึ้นกับการส่ายสั่นไหวของกล้อง AR
    const deltaLocal = new THREE.Vector3().subVectors(currentDragPosLocal, startDragPosLocal);
    
    // กำหนดค่าขีดจำกัดการลากแนวตั้งสูงสุดในพื้นที่ 3D คือ 0.25 เมตร
    const maxDrag = 0.25;
    
    // การลากนิ้วขึ้น (Local Y > 0) คือต้องการเพิ่มพลังยิงและโยนไปข้างหน้า
    const dy = Math.max(0.0, deltaLocal.y);
    const ratio = Math.min(dy / maxDrag, 1.0);
    
    // กำหนดทิศทางซ้าย-ขวาตามการปัดเฉียง (คูณ scale 12.0 เพื่อให้ผลสะท้อนชัดเจน และ clamp ไว้ไม่ให้เอียงเว่อร์ไป)
    let tx = deltaLocal.x * 12.0;
    tx = Math.max(-4.0, Math.min(4.0, tx));
    
    // ปรับแต่งแรงส่ง Y และ Z ตามอัตราส่วนการลากนิ้วขึ้น ( ratio )
    const ty = 1.5 + ratio * 7.5;   // ช่วง 1.5 ถึง 9.0 m/s
    const tz = -2.0 - ratio * 8.5;  // ช่วง -2.0 ถึง -10.5 m/s (เครื่องหมายลบคือพุ่งออกจากตัวผู้เล่น)
    
    const localVelocity = new THREE.Vector3(tx, ty, tz);
    expectedVelocity.copy(localVelocity).applyQuaternion(activeCamera.quaternion);
  };

  // ตัวแปรปรับระดับความยาก Easy/Hard และตำแหน่งฐานแป้นบาส
  let difficulty: 'easy' | 'hard' = 'easy';
  const hoopBasePosition = new THREE.Vector3();

  const ballRadius = 0.06; // hitbox radius (เมตร)
  const ballModelScale = 0.062; // สเกลลูกเก่า
  const ringRadius = 0.28;
  const gravity = 9.81;

  // 1. วาดแป้นและห่วงบาสเกตบอลแบบใกล้เคียงของจริง (โค้งพัด)
  const createSimpleHoop = (): THREE.Group => {
    const hoop = new THREE.Group();

    // 1.1 สร้าง Shape แป้นบาสทรงพัด (Fan-shaped Backboard)
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

    // 1.2 สร้าง Canvas Texture สำหรับหน้าแป้น (สีขาว + กรอบสี่เหลี่ยมสีส้ม)
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 384;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, 512, 384);
      ctx.strokeStyle = '#ff5500';
      ctx.lineWidth = 14;
      const rect_w = 192;
      const rect_h = 140;
      const rect_x = (512 - rect_w) / 2;
      const rect_y = 384 - 55 - rect_h;
      ctx.strokeRect(rect_x, rect_y, rect_w, rect_h);
    }
    const board_texture = new THREE.CanvasTexture(canvas);

    const front_mat = new THREE.MeshStandardMaterial({
      map: board_texture,
      roughness: 0.5,
      metalness: 0.1,
    });
    const side_mat = new THREE.MeshStandardMaterial({
      color: 0xcccccc,
      roughness: 0.6,
    });

    const board_mesh = new THREE.Mesh(board_geo, [side_mat, front_mat]);
    board_mesh.position.set(0, 0, 0);
    hoop.add(board_mesh);

    // 1.3 ส่วนห่วงบาสเก็ตบอลจำลองเดิม (ใช้เป็น fallback จนกว่าโมเดล 3D จะโหลดเสร็จ)
    const fallback_group = new THREE.Group();
    fallback_group.name = "fallback-hoop";

    const bracket_geo = new THREE.BoxGeometry(0.14, 0.10, 0.06);
    const bracket_mat = new THREE.MeshStandardMaterial({ color: 0xff5500, roughness: 0.5 });
    const bracket_mesh = new THREE.Mesh(bracket_geo, bracket_mat);
    bracket_mesh.position.set(0, 0.1, 0.045);
    fallback_group.add(bracket_mesh);

    const ring_geo = new THREE.TorusGeometry(ringRadius, 0.015, 8, 24);
    const ring_mat = new THREE.MeshStandardMaterial({ color: 0xff5500, roughness: 0.2 });
    const ring_mesh = new THREE.Mesh(ring_geo, ring_mat);
    ring_mesh.rotation.x = Math.PI / 2;
    ring_mesh.position.set(0, 0.1, 0.35);
    fallback_group.add(ring_mesh);

    const net_geo = new THREE.CylinderGeometry(ringRadius, ringRadius * 0.7, 0.35, 12, 1, true);
    const net_mat = new THREE.MeshBasicMaterial({ color: 0xeeeeee, wireframe: true, transparent: true, opacity: 0.7 });
    const net_mesh = new THREE.Mesh(net_geo, net_mat);
    net_mesh.position.set(0, -0.075, 0.35);
    fallback_group.add(net_mesh);

    hoop.add(fallback_group);

    return hoop;
  };

  // จัดการจัดตำแหน่งพิกัด สเกล และความเอียงของโมเดลห่วงจริงตามค่าจาก debug tool
  const setup_loaded_hoop = (loaded_hoop: THREE.Group) => {
    // อัปเดตสเกลตัวแบบ
    const scale_factor = 1.006700;
    loaded_hoop.scale.setScalar(scale_factor);

    // ตั้งค่าพิกัดออฟเซ็ตตำแหน่งจริงเพื่อให้ครอบพอดีเขตชน (Z=0.35, Y=0.1)
    loaded_hoop.position.set(0.0000, 0.0443, 0.3295);

    // ปรับองศาความเอียงของห่วง
    loaded_hoop.rotation.set(
      0.6 * Math.PI / 180,
      -91.5 * Math.PI / 180,
      0.6 * Math.PI / 180
    );

    // เปิดการแสดงผลผิวสองด้านเพื่อความคมชัด
    loaded_hoop.traverse((child: any) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
        if (child.material) {
          child.material.side = THREE.DoubleSide;
        }
      }
    });

    // ซ่อนห่วงแบบจำลองเดิม
    const fallback_group = hoopGroup.getObjectByName("fallback-hoop");
    if (fallback_group) {
      fallback_group.visible = false;
    }

    loaded_hoop.name = "glb-hoop";
    hoopGroup.add(loaded_hoop);
    console.log("Hoop GLB successfully mounted!");
  };

  // 2. สร้าง Object3D ลูกบาสเกตบอล (clone จาก GLB หรือ fallback เป็น sphere)
  const createBasketballMesh = (): THREE.Object3D => {
    if (ballModelTemplate) {
      const clone = ballModelTemplate.clone();
      clone.scale.setScalar(ballModelScale);
      clone.traverse((child: any) => { if (child.isMesh) child.castShadow = true; });
      return clone;
    }
    // fallback กรณีโมเดลยังโหลดไม่เสร็จ
    const geo = new THREE.SphereGeometry(ballRadius, 24, 24);
    const mat = new THREE.MeshStandardMaterial({ color: 0xff5500, roughness: 0.7, metalness: 0.1 });
    const ball = new THREE.Mesh(geo, mat);
    ball.castShadow = true;
    return ball;
  };

  // 3. สร้างกลุ่มเม็ดประสำหรับจำลองวิถีโยนบาส (Dotted Trajectory Guide)
  const createTrajectoryPoints = (targetScene: THREE.Scene) => {
    const maxPoints = 20;
    // ปรับรัศมีเป็น 0.015 (3ซม.) เพื่อความหนาเด่นชัดบนทุกแพลตฟอร์มรวมถึง iOS
    const geo = new THREE.SphereGeometry(0.015, 8, 8); 
    const mat = new THREE.MeshBasicMaterial({
      color: 0xa855f7, // สีม่วงสดใส
      transparent: true,
      opacity: 0.85,
    });

    for (let i = 0; i < maxPoints; i++) {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.visible = false;
      targetScene.add(mesh);
      trajectoryPoints.push(mesh);
    }
  };

  // 4. สปอว์นแป้นบาสในแต่ละรอบ (สุ่ม X, Y และสลับระยะลึก Z แบบฟิก)
  const spawnHoopForRound = (round: number) => {
    if (typeof XR8 === 'undefined') return;
    const { camera } = XR8.Threejs.xrScene();
    if (!camera) return;

    // ระยะลึก Z คงที่ในแต่ละรอบ (รอบ 1: -2.5m, รอบ 2: -3.8m, รอบ 3: -5.0m)
    const roundZs = [-2.5, -3.8, -5.0];
    const hoopZ = roundZs[round - 1] || -3.0;

    // สุ่มตำแหน่ง X (แนวขวาง) และ Y (ความสูงระดับสายตา)
    const randomX = (Math.random() - 0.5) * 1.4; // สุ่มระหว่าง -0.7 ถึง 0.7 เมตร
    const randomY = 1.4 + Math.random() * 0.4;   // สุ่มระหว่าง 1.4 ถึง 1.8 เมตร

    // คำนวณพิกัดโลกจากทิศหน้ากล้อง
    const localPos = new THREE.Vector3(randomX, 0, hoopZ);
    localPos.applyQuaternion(camera.quaternion);
    hoopGroup.position.copy(camera.position).add(localPos);
    hoopGroup.position.y = randomY;

    // หันหน้าแป้นเข้าหาตำแหน่งกล้องแนวระนาบ
    const camLookPos = new THREE.Vector3(camera.position.x, hoopGroup.position.y, camera.position.z);
    hoopGroup.lookAt(camLookPos);

    // บันทึกตำแหน่งฐานเริ่มต้น เพื่อนำไปใช้เคลื่อนไหวส่ายในโหมด HARD
    hoopBasePosition.copy(hoopGroup.position);

    if (scene && !scene.children.includes(hoopGroup)) {
      scene.add(hoopGroup);
    }

    isHoopPlaced = true;
    onStateChange({
      isHoopPlaced: true,
      currentRound: round,
      ballsLeft
    });
  };

  // 5. รีเซ็ตลูกบอลลูกใหม่
  const resetBall = () => {
    if (!isHoopPlaced) return;
    if (ballsLeft <= 0 && currentRound >= 3) {
      return;
    }

    if (ballMesh && scene) {
      scene.remove(ballMesh);
    }

    isBallThrown = false;
    hasScoredThisThrow = false;
    canScore = false;
    ballVelocity.set(0, 0, 0);

    ballMesh = createBasketballMesh();
    scene.add(ballMesh);

    onStateChange({ status: 'idle', ballsLeft, currentRound });
  };

  // 6. ตรวจจับการชนแป้นบาส (Vertical Plane Backboard)
  const checkBackboardCollision = () => {
    if (!ballMesh) return;

    const boardX = hoopGroup.position.x;
    const boardY = hoopGroup.position.y + 0.475;
    const boardZ = hoopGroup.position.z;

    const halfWidth = 0.6;
    const halfHeight = 0.475;
    const thickness = 0.03;

    const localBallPos = ballMesh.position.clone().sub(hoopGroup.position);
    localBallPos.applyQuaternion(hoopGroup.quaternion.clone().invert());

    const withinX = localBallPos.x >= -halfWidth && localBallPos.x <= halfWidth;
    const withinY = localBallPos.y >= 0.475 - halfHeight && localBallPos.y <= 0.475 + halfHeight;

    if (withinX && withinY) {
      const collisionLocalZ = thickness / 2 + ballRadius;
      const localVelocity = ballVelocity.clone().applyQuaternion(hoopGroup.quaternion.clone().invert());

      // ป้องกันการชนทะลุแผ่นปะทะ (Tunneling): ขยายขีดจำกัดด้านหลังแป้นเป็น -0.5 เมตร สำหรับรอบที่ 2 และ 3 ที่ยิงแรง
      if (localBallPos.z <= collisionLocalZ && localBallPos.z >= -0.5 && localVelocity.z < 0) {
        localBallPos.z = collisionLocalZ;
        localVelocity.z = -localVelocity.z * 0.55;
        localVelocity.x *= 0.8;

        ballMesh.position.copy(localBallPos).applyQuaternion(hoopGroup.quaternion).add(hoopGroup.position);
        ballVelocity.copy(localVelocity).applyQuaternion(hoopGroup.quaternion);
      }
    }
  };

  // 7. ตรวจจับการชนขอบห่วงแบบวงแหวน (Invisible Ring Hitbox - Torus Collision)
  const checkRingCollision = () => {
    if (!ballMesh) return;

    const ringLocalOffset = new THREE.Vector3(0, 0.1, 0.35);
    const ringCenter = ringLocalOffset.clone().applyQuaternion(hoopGroup.quaternion).add(hoopGroup.position);

    const ballPos = ballMesh.position;
    const dx = ballPos.x - ringCenter.x;
    const dz = ballPos.z - ringCenter.z;
    const distXZ = Math.sqrt(dx * dx + dz * dz);

    if (distXZ > 0.001) {
      const dirX = dx / distXZ;
      const dirZ = dz / distXZ;

      const closestX = ringCenter.x + dirX * ringRadius;
      const closestZ = ringCenter.z + dirZ * ringRadius;
      const closestPointOnRing = new THREE.Vector3(closestX, ringCenter.y, closestZ);

      const distance3D = ballPos.distanceTo(closestPointOnRing);
      // ขยายขอบเขตการเช็คชนขอบห่วงเป็น 0.035 เมตร เพื่อรองรับความเร็วและความเล็กของลูกบาสใหม่ไม่ให้ทะลุขอบห่วงในรอบไกลๆ
      const collisionThreshold = ballRadius + 0.035;

      if (distance3D < collisionThreshold) {
        const normal = new THREE.Vector3().subVectors(ballPos, closestPointOnRing).normalize();
        ballMesh.position.copy(closestPointOnRing).addScaledVector(normal, collisionThreshold);

        const dot = ballVelocity.dot(normal);
        if (dot < 0) {
          ballVelocity.addScaledVector(normal, -(1 + 0.5) * dot);
        }
      }
    }
  };

  // 8. ตรวจจับการชู้ตทำคะแนน
  const checkScore = () => {
    if (!ballMesh || hasScoredThisThrow) return;

    const ringLocalOffset = new THREE.Vector3(0, 0.1, 0.35);
    const ringCenter = ringLocalOffset.clone().applyQuaternion(hoopGroup.quaternion).add(hoopGroup.position);

    const ballPos = ballMesh.position;
    const dx = ballPos.x - ringCenter.x;
    const dz = ballPos.z - ringCenter.z;
    const distXZ = Math.sqrt(dx * dx + dz * dz);

    if (distXZ < ringRadius && ballPos.y > ringCenter.y) {
      canScore = true;
    }

    if (canScore && ballPos.y <= ringCenter.y && distXZ < ringRadius && ballVelocity.y < 0) {
      hasScoredThisThrow = true;
      canScore = false;
      score += 1;
      if (typeof navigator !== 'undefined' && "vibrate" in navigator && typeof navigator.vibrate === "function") {
        navigator.vibrate(200); // สั่น 200ms
      }
      onStateChange({ score, status: 'scored' });
    }
  };



  return {
    name: 'basketball-scene-init',
    onStart: ({ canvas }: any) => {
      const { scene: xrScene, camera, renderer } = XR8.Threejs.xrScene();
      scene = xrScene;

      renderer.shadowMap.enabled = true;

      // เพิ่มแสงสว่าง
      const ambientLight = new THREE.AmbientLight(0xffffff, 0.65);
      scene.add(ambientLight);

      const dirLight = new THREE.DirectionalLight(0xffffff, 0.95);
      dirLight.position.set(0, 9, 5);
      scene.add(dirLight);

      // โหลดโครงสร้างแป้นบาสเก็ตบอล (รอสปอว์น)
      hoopGroup = createSimpleHoop();

      // ส่งสถานะเริ่มต้นการดาวน์โหลดโมเดล
      onStateChange({ isAssetLoaded: false, assetLoadProgress: 0 });

      let ball_loaded = false;
      let hoop_loaded = false;
      let ball_progress = 0;
      let hoop_progress = 0;

      const update_progress = () => {
        const total_progress = Math.round((ball_progress + hoop_progress) / 2);
        onStateChange({
          assetLoadProgress: total_progress,
          isAssetLoaded: ball_loaded && hoop_loaded
        });
      };

      // 1. โหลดโมเดล GLB ลูกบาสเก็ตบอล
      new GLTFLoader().load(
        '/3d/throwing/basketball.glb',
        (gltf) => {
          ballModelTemplate = gltf.scene;
          ball_loaded = true;
          ball_progress = 100;
          update_progress();
        },
        (xhr) => {
          if (xhr.total > 0) {
            ball_progress = Math.round((xhr.loaded / xhr.total) * 100);
            update_progress();
          }
        },
        (error) => {
          console.error('Error loading basketball GLB:', error);
          ball_loaded = true;
          ball_progress = 100;
          update_progress();
        }
      );

      // 2. โหลดโมเดล GLB ห่วงบาสเก็ตบอล
      new GLTFLoader().load(
        '/basketball/basketball hoop 3d model (2).glb',
        (gltf) => {
          setup_loaded_hoop(gltf.scene);
          hoop_loaded = true;
          isHoopModelLoaded = true;
          hoop_progress = 100;
          update_progress();
        },
        (xhr) => {
          if (xhr.total > 0) {
            hoop_progress = Math.round((xhr.loaded / xhr.total) * 100);
            update_progress();
          }
        },
        (error) => {
          console.error('Error loading hoop GLB:', error);
          hoop_loaded = true;
          isHoopModelLoaded = true;
          hoop_progress = 100;
          update_progress();
        }
      );

      // โหลดโครงสร้างเส้นประวิถีโค้ง (แบบกลุ่มเม็ดประเพื่อให้หนาขึ้นบน iOS)
      createTrajectoryPoints(scene);

      canvas.addEventListener('touchmove', (e: Event) => e.preventDefault());

      camera.position.set(0, 1.6, 0);
      XR8.XrController.updateCameraProjectionMatrix({
        origin: camera.position,
        facing: camera.quaternion,
      });

      const handleTouch = (e: TouchEvent) => {
        // เรียก recenter เฉพาะตอนที่ยังไม่มีแป้นบาสสปอว์นขึ้นมาเท่านั้น
        if (e.touches.length === 1 && !isBallThrown && !isHoopPlaced) {
          XR8.XrController.recenter();
        }
      };
      canvas.addEventListener('touchstart', handleTouch, true);

      // เพิ่มฟังก์ชันเรียกโยนลูกบาสจากภายนอก
      (window as any).throwBasketball = (velocity: THREE.Vector3) => {
        if (isBallThrown || ballsLeft <= 0 || !isHoopPlaced) return;
        ballVelocity.copy(velocity);
        isBallThrown = true;
        onStateChange({ status: 'thrown' });
      };

      // ฟังก์ชันลากบอลรอบการชู้ตแบบใหม่ (วัดแรงด้วยตำแหน่งสัมบูรณ์บน Local Space)
      (window as any).startDragging = (clientX: number, clientY: number) => {
        const { camera: activeCamera } = XR8.Threejs.xrScene();
        if (!activeCamera) return;

        isDragging = true;
        lastTouchScreenX = clientX;
        lastTouchScreenY = clientY;
        lastSignificantMoveTime = Date.now();
        frozenWorldPos = null;
        frozenVelocity = null;

        const worldPos = getProjectedPosition(clientX, clientY, activeCamera);
        startDragPosLocal.copy(worldPos).applyMatrix4(activeCamera.matrixWorldInverse);
        currentDragPosLocal.copy(startDragPosLocal);
        
        expectedVelocity.set(0, 0, 0);
      };

      (window as any).updateDragging = (clientX: number, clientY: number) => {
        const { camera: activeCamera } = XR8.Threejs.xrScene();
        if (!activeCamera) return;

        // เช็คว่านิ้วขยับจริงหรือแค่ jitter (deadzone 3px)
        const sdx = clientX - lastTouchScreenX;
        const sdy = clientY - lastTouchScreenY;
        const screenDist = Math.sqrt(sdx * sdx + sdy * sdy);

        if (screenDist > 3) {
          lastTouchScreenX = clientX;
          lastTouchScreenY = clientY;
          lastSignificantMoveTime = Date.now();
          frozenWorldPos = null;
          frozenVelocity = null;

          const worldPos = getProjectedPosition(clientX, clientY, activeCamera);
          currentDragPosLocal.copy(worldPos).applyMatrix4(activeCamera.matrixWorldInverse);
          calculateExpectedVelocity(activeCamera);
        }
        // ถ้านิ้วขยับน้อยกว่า 3px ไม่อัปเดตอะไรเลย ปล่อยให้ onUpdate จัดการ freeze
      };

      (window as any).stopDraggingAndThrow = (clientX: number, clientY: number) => {
        isDragging = false;
        trajectoryPoints.forEach(p => { p.visible = false; });

        const { camera: activeCamera } = XR8.Threejs.xrScene();
        if (!activeCamera || isBallThrown || ballsLeft <= 0 || !isHoopPlaced) return;

        // อัปเดตตำแหน่งจุดสุดท้ายก่อนชู้ต
        const worldPos = getProjectedPosition(clientX, clientY, activeCamera);
        currentDragPosLocal.copy(worldPos).applyMatrix4(activeCamera.matrixWorldInverse);
        calculateExpectedVelocity(activeCamera);

        ballVelocity.copy(expectedVelocity);
        isBallThrown = true;
        onStateChange({ status: 'thrown' });
      };

      // เริ่มต้นสถานะเกม (ยังไม่เสกห่วงบาส รอปรับระนาบมือถือ)
      ballsLeft = 3;
      currentRound = 1;
      score = 0;
      isHoopPlaced = false;
      clock.getDelta();

      onStateChange({
        score: 0,
        ballsLeft: 3,
        currentRound: 1,
        status: 'idle',
        isHoopPlaced: false,
        isDeviceAligned: false,
      });

      // เพิ่มฟังก์ชันสำหรับ React ปรับระดับความยาก
      (window as any).setDifficulty = (mode: 'easy' | 'hard') => {
        difficulty = mode;
        // หากเปลี่ยนกลับเป็น easy ให้เคลียร์ตำแหน่งแป้นกลับมาที่จุดฐานเริ่มต้นทันที
        if (mode === 'easy' && hoopGroup && isHoopPlaced) {
          hoopGroup.position.copy(hoopBasePosition);
        }
      };

      (window as any)._cleanupBasketball = () => {
        if (hoopGroup) scene.remove(hoopGroup);
        if (ballMesh) scene.remove(ballMesh);
        trajectoryPoints.forEach(p => {
          if (p.parent) p.parent.remove(p);
        });
        trajectoryPoints = [];
        canvas.removeEventListener('touchstart', handleTouch, true);
        delete (window as any).throwBasketball;
        delete (window as any).startDragging;
        delete (window as any).updateDragging;
        delete (window as any).stopDraggingAndThrow;
        delete (window as any).setDifficulty;
      };
    },
    onUpdate: () => {
      if (typeof XR8 === 'undefined') return;
      const { camera } = XR8.Threejs.xrScene();
      if (!camera) return;

      const dt = Math.min(clock.getDelta(), 0.03);

      // 1. ตรวจสอบการปรับระนาบมือถือก่อนเสกแป้นบาส
      if (!isHoopPlaced) {
        const euler = new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ');
        const isAligned = Math.abs(euler.x) < 0.15;

        onStateChange({
          isDeviceAligned: isAligned,
          isHoopPlaced: false,
        });

        if (isAligned && ballModelTemplate && isHoopModelLoaded) {
          spawnHoopForRound(1); // เสกแป้นบาสสำหรับรอบที่ 1
          resetBall();
        }
        return;
      }

      // ขยับส่ายแป้นบาสแนวราบช้าๆ ในพิกัด Local XY ของตัวห่วง เมื่อเปิดโหมด HARD
      if (isHoopPlaced && difficulty === 'hard') {
        const elapsedTime = clock.getElapsedTime();
        // เคลื่อนที่แบบ Sine/Cosine ส่ายซ้ายขวา 50 ซม. ขึ้นลง 20 ซม. ความเร็วช้าๆ
        const localOffset = new THREE.Vector3(
          Math.sin(elapsedTime * 1.0) * 0.5,
          Math.cos(elapsedTime * 1.3) * 0.2,
          0
        );
        localOffset.applyQuaternion(hoopGroup.quaternion);
        hoopGroup.position.copy(hoopBasePosition).add(localOffset);
      }

      if (!ballMesh) return;

      if (isBallThrown) {
        // อัปเดตตำแหน่งจากแรงโน้มถ่วง
        ballVelocity.y -= gravity * dt;
        ballMesh.position.addScaledVector(ballVelocity, dt);

        // คำนวณการชนและการนับคะแนน
        checkBackboardCollision();
        checkRingCollision();
        checkScore();

        // เช็คการตกพื้นดิน (Y < 0.06)
        if (ballMesh.position.y < ballRadius && ballVelocity.y < 0) {
          if (Math.abs(ballVelocity.y) > 1.2) {
            ballMesh.position.y = ballRadius;
            ballVelocity.y = -ballVelocity.y * 0.45; // เด้งพื้นเบาๆ
            ballVelocity.x *= 0.6;
            ballVelocity.z *= 0.6;
          } else {
            ballVelocity.set(0, 0, 0);
            if (!hasScoredThisThrow) {
              onStateChange({ status: 'missed' });
            }
            isBallThrown = false;

            ballsLeft -= 1;

            setTimeout(() => {
              if (ballsLeft <= 0) {
                if (currentRound < 3) {
                  currentRound += 1;
                  ballsLeft = 3;
                  spawnHoopForRound(currentRound);
                  resetBall();
                } else {
                  // สิ้นสุด 3 รอบ เล่นจบแล้ว!
                  ballsLeft = 0;
                  onStateChange({ status: 'idle', ballsLeft: 0, currentRound: 3 });
                }
              } else {
                resetBall();
              }
            }, 1200);
          }
        }

        // หลุดขอบเขตออกไปไกลเกินไป (รอบ 3 อยู่ Z = -5.0 เมตร ให้ Z หลุดขอบเขตไกลขึ้น)
        if (ballMesh.position.y < -3.0 || ballMesh.position.z < -12.0 || ballMesh.position.z > 5.0) {
          if (!hasScoredThisThrow) {
            onStateChange({ status: 'missed' });
          }
          isBallThrown = false;
          ballsLeft -= 1;

          if (ballsLeft <= 0) {
            if (currentRound < 3) {
              currentRound += 1;
              ballsLeft = 3;
              spawnHoopForRound(currentRound);
              resetBall();
            } else {
              ballsLeft = 0;
              onStateChange({ status: 'idle', ballsLeft: 0, currentRound: 3 });
            }
          } else {
            resetBall();
          }
        }
      } else {
        if (isDragging) {
          const now = Date.now();
          // ถ้านิ้วนิ่งมานานกว่า 2 วินาที ให้ล็อคตำแหน่งและวิถีโค้งไว้เลย (ป้องกัน AR jitter)
          if (!frozenWorldPos && (now - lastSignificantMoveTime) > 2000) {
            frozenWorldPos = ballMesh.position.clone();
            frozenVelocity = expectedVelocity.clone();
          }

          if (frozenWorldPos) {
            ballMesh.position.copy(frozenWorldPos);
            // ไม่ต้องคำนวณ velocity ใหม่ ใช้ค่าที่ล็อคไว้
            if (frozenVelocity) expectedVelocity.copy(frozenVelocity);
          } else {
            const currentDragPosWorld = currentDragPosLocal.clone().applyMatrix4(camera.matrixWorld);
            ballMesh.position.copy(currentDragPosWorld);
            calculateExpectedVelocity(camera);
          }
        } else {
          // ซิงก์ตำแหน่งลูกบอลให้อยู่ติดกับกล้อง (เสมือนผู้ใช้ถือไว้เพื่อพร้อมปัดชู้ต)
          const offset = new THREE.Vector3(0, -0.15, -0.4);
          offset.applyQuaternion(camera.quaternion);
          ballMesh.position.copy(camera.position).add(offset);
        }

        // หมุนลูกบอลช้าๆ ขณะรอการชู้ตเพื่อความสมจริง
        ballMesh.rotateY(1.0 * dt);
        ballMesh.rotateX(0.5 * dt);

        // อัปเดตและเรนเดอร์เส้นไกด์วิถีโค้งที่ 60fps ในลูปหลัก เพื่อให้หันตามมุมกล้องเรียลไทม์
        if (isDragging && trajectoryPoints.length > 0) {
          const maxPoints = 20;
          const simDt = 0.065; // ระยะเวลาในการจำลองแต่ละจุดเพื่อให้วิถีโค้งกำลังดี

          const tempPos = new THREE.Vector3().copy(ballMesh.position);
          const tempVel = new THREE.Vector3().copy(expectedVelocity);
          let activeCount = 0;

          for (let i = 0; i < maxPoints; i++) {
            const sphere = trajectoryPoints[i];
            sphere.position.copy(tempPos);
            sphere.visible = true;
            activeCount++;

            tempVel.y -= gravity * simDt;
            tempPos.addScaledVector(tempVel, simDt);

            // หากความเร็วตกดิ่งมากไป หรือ ตกต่ำกว่าระดับพื้นดิน ให้หยุดวาดต่อ
            if (tempVel.y < -3.0 || tempPos.y < 0) {
              break;
            }
          }

          // ซ่อนเม็ดประส่วนเกิน
          for (let i = activeCount; i < maxPoints; i++) {
            trajectoryPoints[i].visible = false;
          }
        }
      }
    }
  };
};
