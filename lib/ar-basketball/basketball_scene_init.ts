import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

declare const XR8: any;

export type GameMode = 'normal' | 'fade' | 'multi' | 'wind' | 'time_attack';

export interface GameState {
  score: number;
  ballsLeft: number;
  status: 'idle' | 'aiming' | 'thrown' | 'scored' | 'missed';
  isHoopPlaced?: boolean;
  isDeviceAligned?: boolean;
  currentRound?: number;
  isAssetLoaded?: boolean;
  assetLoadProgress?: number;
  gameMode?: GameMode;
  timeLeft?: number;
  combo?: number;
  windSpeed?: number;
  windDirection?: 'left' | 'right' | 'none';
  activeHoopMultiplier?: number;
}

export const initBasketballScenePipelineModule = (initialMode: GameMode, onStateChange: (state: Partial<GameState>) => void) => {
  let scene: THREE.Scene;
  let hoopGroup: THREE.Group;
  let trajectoryPoints: THREE.Mesh[] = [];
  const clock = new THREE.Clock();

  // โหมดเกมเก็บค่าจาก React ตอนเริ่มสตาร์ท
  const gameMode: GameMode = initialMode;
  let timeLeft = 60; // สำหรับ Time Attack
  let combo = 0; // คอมโบยิงเข้าต่อเนื่อง
  let windSpeed = 0; // ความเร็วลม
  let windDirection: 'left' | 'right' | 'none' = 'none'; // ทิศทางลม
  let fadeTimer = 3.5; // เวลาถอยหลังโหมดแวบหาย

  // ระบบหลายแป้นบาส (Multi-Hoop)
  interface SubHoop {
    group: THREE.Group;
    basePosition: THREE.Vector3;
    scoreMultiplier: number;
    isGolden: boolean;
    speed: number;
    amplitude: number;
    phase: number;
  }
  let subHoops: SubHoop[] = [];

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
  let ballsLeft = gameMode === 'time_attack' ? 999 : 3;   // โอกาสโยนในรอบปัจจุบัน

  let hasScoredThisThrow = false;
  let canScore = false; // ตรวจสอบว่าผ่านห่วงจากบนลงล่างเท่านั้น

  // ponytail: camera-attached dragging states for zero AR latency jitter
  let isDragging = false;
  const startLocalPos = new THREE.Vector3();
  const currentLocalPos = new THREE.Vector3();
  const expectedVelocity = new THREE.Vector3();
  let startScreenX = 0;
  let startScreenY = 0;
  let dragScreenX = 0;
  let dragScreenY = 0;

  const getLocalProjectedPosition = (clientX: number, clientY: number, activeCamera: THREE.Camera): THREE.Vector3 => {
    const ndc = new THREE.Vector2(
      (clientX / window.innerWidth) * 2 - 1,
      -(clientY / window.innerHeight) * 2 + 1
    );
    const rayDir = new THREE.Vector3(ndc.x, ndc.y, -1).applyMatrix4(activeCamera.projectionMatrixInverse).normalize();
    const t = -0.4 / rayDir.z;
    return rayDir.multiplyScalar(t);
  };

  const calculateExpectedVelocity = (activeCamera: THREE.Camera) => {
    const deltaLocal = new THREE.Vector3().subVectors(currentLocalPos, startLocalPos);
    const maxDrag = 0.25;
    const dy = Math.max(0.0, deltaLocal.y);
    const ratio = Math.min(dy / maxDrag, 1.0);

    let tx = deltaLocal.x * 12.0;
    tx = Math.max(-4.0, Math.min(4.0, tx));

    const ty = 1.5 + ratio * 7.5;
    const tz = -2.0 - ratio * 8.5;

    const localVelocity = new THREE.Vector3(tx, ty, tz);
    expectedVelocity.copy(localVelocity).applyQuaternion(activeCamera.quaternion);
  };

  // ตัวแปรปรับระดับความยาก Easy/Hard และตำแหน่งฐานแป้นบาส
  let difficulty: 'easy' | 'hard' = 'easy';
  const hoopBasePosition = new THREE.Vector3();

  const ballRadius = 0.08; // hitbox radius (เมตร)
  const ballModelScale = 0.083; // สเกลลูกใหม่สัมพันธ์กับขนาดรัศมี
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

    // วงแหวนแจ้งเตือนเวลาสำหรับโหมด Fade
    const indicator_geo = new THREE.TorusGeometry(ringRadius + 0.015, 0.008, 8, 24);
    const indicator_mat = new THREE.MeshBasicMaterial({
      color: 0x22c55e, // เขียวเริ่มต้น
      transparent: true,
      opacity: 0.8,
      visible: false // ปิดใช้งานเป็นค่าเริ่มต้น
    });
    const indicator_mesh = new THREE.Mesh(indicator_geo, indicator_mat);
    indicator_mesh.name = "fade-indicator-ring";
    indicator_mesh.rotation.x = Math.PI / 2;
    indicator_mesh.position.set(0, 0.1, 0.35);
    hoop.add(indicator_mesh);

    return hoop;
  };

  // จัดการจัดตำแหน่งพิกัด สเกล และความเอียงของโมเดลห่วงจริงตามค่าจาก debug tool
  const setup_loaded_hoop = (loaded_hoop: THREE.Group) => {
    const scale_factor = 1.006700;
    loaded_hoop.scale.setScalar(scale_factor);
    loaded_hoop.position.set(0.0000, 0.0443, 0.3295);
    loaded_hoop.rotation.set(
      0.6 * Math.PI / 180,
      -91.5 * Math.PI / 180,
      0.6 * Math.PI / 180
    );

    loaded_hoop.traverse((child: any) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
        if (child.material) {
          child.material.side = THREE.DoubleSide;
        }
      }
    });

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
    const geo = new THREE.SphereGeometry(ballRadius, 24, 24);
    const mat = new THREE.MeshStandardMaterial({ color: 0xff5500, roughness: 0.7, metalness: 0.1 });
    const ball = new THREE.Mesh(geo, mat);
    ball.castShadow = true;
    return ball;
  };

  // 3. สร้างกลุ่มเม็ดประสำหรับจำลองวิถีโยนบาส
  const createTrajectoryPoints = (targetScene: THREE.Scene) => {
    const maxPoints = 20;
    const geo = new THREE.SphereGeometry(0.015, 8, 8);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xa855f7,
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

  // ลบห่วงย่อยออกทั้งหมด
  const clearSubHoops = () => {
    subHoops.forEach(sh => {
      if (sh.group.parent) {
        sh.group.parent.remove(sh.group);
      }
    });
    subHoops = [];
  };

  // 4. สปอว์นแป้นบาสในแต่ละรอบ
  const spawnHoopForRound = (round: number) => {
    if (typeof XR8 === 'undefined') return;
    const { camera } = XR8.Threejs.xrScene();
    if (!camera) return;

    clearSubHoops();

    if (gameMode === 'multi') {
      if (hoopGroup && hoopGroup.parent) {
        hoopGroup.parent.remove(hoopGroup);
      }

      const hoopConfigs = [
        { label: 'left', xOffset: -1.2, zDist: -3.8, yHeight: 1.5, mult: 2, speed: 1.0, amp: 0.5, canBeGolden: false },
        { label: 'center', xOffset: 0.0, zDist: -2.5, yHeight: 1.4, mult: 1, speed: 0.0, amp: 0.0, canBeGolden: false },
        { label: 'right', xOffset: 1.2, zDist: -5.0, yHeight: 1.6, mult: 3, speed: 1.8, amp: 0.7, canBeGolden: true }
      ];

      hoopConfigs.forEach(cfg => {
        const clonedGroup = hoopGroup.clone();
        const isGolden = cfg.canBeGolden && Math.random() < 0.3;
        const multiplier = isGolden ? 5 : cfg.mult;

        if (isGolden) {
          clonedGroup.traverse((child: any) => {
            if (child.isMesh) {
              child.material = child.material.clone();
              child.material.color.setHex(0xffb700);
              child.material.metalness = 0.95;
              child.material.roughness = 0.05;
              if (child.name === 'net' || child.name === 'fallback-hoop') {
                child.material.color.setHex(0xffd700);
              }
            }
          });
        }

        const indicator = clonedGroup.getObjectByName("fade-indicator-ring");
        if (indicator) indicator.visible = false;

        const localPos = new THREE.Vector3(cfg.xOffset, 0, cfg.zDist);
        localPos.applyQuaternion(camera.quaternion);
        
        clonedGroup.position.copy(camera.position).add(localPos);
        clonedGroup.position.y = cfg.yHeight;

        const lookPos = new THREE.Vector3(camera.position.x, clonedGroup.position.y, camera.position.z);
        clonedGroup.lookAt(lookPos);

        scene.add(clonedGroup);

        subHoops.push({
          group: clonedGroup,
          basePosition: clonedGroup.position.clone(),
          scoreMultiplier: multiplier,
          isGolden,
          speed: cfg.speed,
          amplitude: cfg.amp,
          phase: Math.random() * Math.PI * 2
        });
      });

      isHoopPlaced = true;
      onStateChange({
        isHoopPlaced: true,
        currentRound: round,
        ballsLeft,
        gameMode,
        timeLeft
      });
      return;
    }

    if (scene && !scene.children.includes(hoopGroup)) {
      scene.add(hoopGroup);
    }

    let hoopZ = -3.0;
    if (gameMode === 'normal') {
      const roundZs = [-2.5, -3.8, -5.0];
      hoopZ = roundZs[round - 1] || -3.0;
    } else if (gameMode === 'fade') {
      hoopZ = -2.5 - Math.random() * 2.0;
    } else if (gameMode === 'time_attack') {
      hoopZ = -2.8 - Math.random() * 1.8;
    } else if (gameMode === 'wind') {
      const roundZs = [-2.5, -3.8, -4.5];
      hoopZ = roundZs[round - 1] || -3.2;
    }

    const randomX = (Math.random() - 0.5) * (gameMode === 'fade' ? 1.0 : 1.3);
    const randomY = 1.4 + Math.random() * 0.4;

    const localPos = new THREE.Vector3(randomX, 0, hoopZ);
    localPos.applyQuaternion(camera.quaternion);
    hoopGroup.position.copy(camera.position).add(localPos);
    hoopGroup.position.y = randomY;

    const camLookPos = new THREE.Vector3(camera.position.x, hoopGroup.position.y, camera.position.z);
    hoopGroup.lookAt(camLookPos);

    hoopBasePosition.copy(hoopGroup.position);

    const indicator = hoopGroup.getObjectByName("fade-indicator-ring") as THREE.Mesh;
    if (indicator) {
      if (gameMode === 'fade') {
        indicator.visible = true;
        indicator.material = (indicator.material as THREE.Material).clone();
        (indicator.material as any).color.setHex(0x22c55e);
      } else {
        indicator.visible = false;
      }
    }

    if (gameMode === 'wind') {
      windDirection = Math.random() > 0.5 ? 'right' : 'left';
      windSpeed = parseFloat((1.5 + Math.random() * 3.0).toFixed(1));
    } else {
      windDirection = 'none';
      windSpeed = 0;
    }

    isHoopPlaced = true;
    onStateChange({
      isHoopPlaced: true,
      currentRound: round,
      ballsLeft,
      gameMode,
      timeLeft,
      windSpeed,
      windDirection
    });
  };

  // 5. รีเซ็ตลูกบอลลูกใหม่
  const resetBall = () => {
    if (!isHoopPlaced) return;
    if (gameMode !== 'time_attack' && ballsLeft <= 0 && currentRound >= 3) {
      return;
    }

    if (ballMesh) {
      if (ballMesh.parent) {
        ballMesh.parent.remove(ballMesh);
      }
    }

    isBallThrown = false;
    hasScoredThisThrow = false;
    canScore = false;
    ballVelocity.set(0, 0, 0);

    ballMesh = createBasketballMesh();

    const { camera } = XR8.Threejs.xrScene();
    if (camera) {
      camera.add(ballMesh);
      ballMesh.position.set(0, -0.15, -0.4);
      ballMesh.rotation.set(0, 0, 0);
    } else {
      scene.add(ballMesh);
    }

    if (gameMode === 'fade') {
      fadeTimer = 3.5;
      const indicator = hoopGroup.getObjectByName("fade-indicator-ring") as THREE.Mesh;
      if (indicator) {
        indicator.visible = true;
        (indicator.material as any).color.setHex(0x22c55e);
      }
    }

    onStateChange({ 
      status: 'idle', 
      ballsLeft: gameMode === 'time_attack' ? 999 : ballsLeft, 
      currentRound,
      gameMode,
      timeLeft,
      combo
    });
  };

  // 6. ตรวจจับการชนแป้นบาสเดี่ยว
  const checkSingleBackboardCollision = (hoop: THREE.Group) => {
    const halfWidth = 0.6;
    const halfHeight = 0.475;
    const thickness = 0.03;

    const localBallPos = ballMesh!.position.clone().sub(hoop.position);
    localBallPos.applyQuaternion(hoop.quaternion.clone().invert());

    const withinX = localBallPos.x >= -halfWidth && localBallPos.x <= halfWidth;
    const withinY = localBallPos.y >= 0.475 - halfHeight && localBallPos.y <= 0.475 + halfHeight;

    if (withinX && withinY) {
      const collisionLocalZ = thickness / 2 + ballRadius;
      const localVelocity = ballVelocity.clone().applyQuaternion(hoop.quaternion.clone().invert());

      if (localBallPos.z <= collisionLocalZ && localBallPos.z >= -0.5 && localVelocity.z < 0) {
        localBallPos.z = collisionLocalZ;
        localVelocity.z = -localVelocity.z * 0.75;
        localVelocity.x *= 0.9;

        ballMesh!.position.copy(localBallPos).applyQuaternion(hoop.quaternion).add(hoop.position);
        ballVelocity.copy(localVelocity).applyQuaternion(hoop.quaternion);
      }
    }
  };

  const checkBackboardCollision = () => {
    if (!ballMesh) return;
    if (gameMode === 'multi') {
      subHoops.forEach(sh => checkSingleBackboardCollision(sh.group));
    } else {
      checkSingleBackboardCollision(hoopGroup);
    }
  };

  // 7. ตรวจจับการชนขอบห่วงเดี่ยว
  const checkSingleRingCollision = (hoop: THREE.Group) => {
    const ringLocalOffset = new THREE.Vector3(0, 0.1, 0.35);
    const ringCenter = ringLocalOffset.clone().applyQuaternion(hoop.quaternion).add(hoop.position);

    const ballPos = ballMesh!.position;
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
      const collisionThreshold = ballRadius + 0.035;

      if (distance3D < collisionThreshold) {
        const normal = new THREE.Vector3().subVectors(ballPos, closestPointOnRing).normalize();
        ballMesh!.position.copy(closestPointOnRing).addScaledVector(normal, collisionThreshold);

        const dot = ballVelocity.dot(normal);
        if (dot < 0) {
          ballVelocity.addScaledVector(normal, -(1 + 0.5) * dot);
        }
      }
    }
  };

  const checkRingCollision = () => {
    if (!ballMesh) return;
    if (gameMode === 'multi') {
      subHoops.forEach(sh => checkSingleRingCollision(sh.group));
    } else {
      checkSingleRingCollision(hoopGroup);
    }
  };

  // 8. ตรวจจับการชู้ตทำคะแนนเดี่ยว
  const checkSingleScore = (hoop: THREE.Group): boolean => {
    const ringLocalOffset = new THREE.Vector3(0, 0.1, 0.35);
    const ringCenter = ringLocalOffset.clone().applyQuaternion(hoop.quaternion).add(hoop.position);

    const ballPos = ballMesh!.position;
    const dx = ballPos.x - ringCenter.x;
    const dz = ballPos.z - ringCenter.z;
    const distXZ = Math.sqrt(dx * dx + dz * dz);

    if (distXZ < ringRadius && ballPos.y > ringCenter.y) {
      canScore = true;
    }

    if (canScore && ballPos.y <= ringCenter.y && distXZ < ringRadius && ballVelocity.y < 0) {
      canScore = false;
      return true;
    }
    return false;
  };

  const handleSuccessfulScore = (multiplier: number) => {
    hasScoredThisThrow = true;
    const pointsGained = 1 * multiplier;
    score += pointsGained;

    if (gameMode === 'time_attack') {
      combo += 1;
      const timeBonus = 3 + combo;
      timeLeft = Math.min(60, timeLeft + timeBonus);
    }

    if (typeof navigator !== 'undefined' && "vibrate" in navigator && typeof navigator.vibrate === "function") {
      navigator.vibrate(200);
    }

    onStateChange({ 
      score, 
      status: 'scored',
      combo,
      timeLeft,
      activeHoopMultiplier: multiplier
    });
  };

  const checkScore = () => {
    if (!ballMesh || hasScoredThisThrow) return;

    if (gameMode === 'multi') {
      for (const sh of subHoops) {
        if (checkSingleScore(sh.group)) {
          handleSuccessfulScore(sh.scoreMultiplier);
          break;
        }
      }
    } else {
      if (checkSingleScore(hoopGroup)) {
        let multiplier = 1;
        if (gameMode === 'normal') {
          multiplier = currentRound;
        } else if (gameMode === 'fade') {
          multiplier = 2;
        } else if (gameMode === 'wind') {
          multiplier = 3;
        }
        handleSuccessfulScore(multiplier);
      }
    }
  };

  return {
    name: 'basketball-scene-init',
    onStart: ({ canvas }: any) => {
      const { scene: xrScene, camera, renderer } = XR8.Threejs.xrScene();
      scene = xrScene;

      renderer.shadowMap.enabled = true;

      const ambientLight = new THREE.AmbientLight(0xffffff, 0.65);
      scene.add(ambientLight);

      const dirLight = new THREE.DirectionalLight(0xffffff, 0.95);
      dirLight.position.set(0, 9, 5);
      scene.add(dirLight);

      hoopGroup = createSimpleHoop();

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

      createTrajectoryPoints(scene);

      canvas.addEventListener('touchmove', (e: Event) => e.preventDefault());

      camera.position.set(0, 1.6, 0);
      XR8.XrController.updateCameraProjectionMatrix({
        origin: camera.position,
        facing: camera.quaternion,
      });

      const handleTouch = (e: TouchEvent) => {
        if (e.touches.length === 1 && !isBallThrown && !isHoopPlaced) {
          XR8.XrController.recenter();
        }
      };
      canvas.addEventListener('touchstart', handleTouch, true);

      (window as any).throwBasketball = (velocity: THREE.Vector3) => {
        if (isBallThrown || ballsLeft <= 0 || !isHoopPlaced) return;
        ballVelocity.copy(velocity);
        isBallThrown = true;
        onStateChange({ status: 'thrown' });
      };

      (window as any).startDragging = (clientX: number, clientY: number) => {
        const { camera: activeCamera } = XR8.Threejs.xrScene();
        if (!activeCamera || !ballMesh) return;

        isDragging = true;
        startScreenX = clientX;
        startScreenY = clientY;
        dragScreenX = clientX;
        dragScreenY = clientY;

        const localPos = getLocalProjectedPosition(clientX, clientY, activeCamera);
        startLocalPos.copy(localPos);
        currentLocalPos.copy(localPos);
        ballMesh.position.copy(localPos);

        expectedVelocity.set(0, 0, 0);
      };

      (window as any).updateDragging = (clientX: number, clientY: number) => {
        dragScreenX = clientX;
        dragScreenY = clientY;
      };

      (window as any).stopDraggingAndThrow = (clientX: number, clientY: number) => {
        isDragging = false;
        trajectoryPoints.forEach(p => { p.visible = false; });

        const { camera: activeCamera } = XR8.Threejs.xrScene();
        if (!activeCamera || isBallThrown || ballsLeft <= 0 || !isHoopPlaced || !ballMesh) return;

        const localPos = getLocalProjectedPosition(clientX, clientY, activeCamera);
        currentLocalPos.copy(localPos);
        calculateExpectedVelocity(activeCamera);

        const worldPos = new THREE.Vector3();
        ballMesh.getWorldPosition(worldPos);

        if (ballMesh.parent) {
          ballMesh.parent.remove(ballMesh);
        }
        scene.add(ballMesh);

        ballMesh.position.copy(worldPos);
        ballVelocity.copy(expectedVelocity);
        isBallThrown = true;
        onStateChange({ status: 'thrown' });
      };

      ballsLeft = gameMode === 'time_attack' ? 999 : 3;
      currentRound = 1;
      score = 0;
      isHoopPlaced = false;
      clock.getDelta();

      onStateChange({
        score: 0,
        ballsLeft: gameMode === 'time_attack' ? 999 : 3,
        currentRound: 1,
        status: 'idle',
        isHoopPlaced: false,
        isDeviceAligned: false,
      });

      (window as any).setDifficulty = (mode: 'easy' | 'hard') => {
        difficulty = mode;
        if (mode === 'easy' && hoopGroup && isHoopPlaced) {
          hoopGroup.position.copy(hoopBasePosition);
        }
      };

      (window as any)._cleanupBasketball = () => {
        if (hoopGroup) scene.remove(hoopGroup);
        if (ballMesh) scene.remove(ballMesh);
        clearSubHoops();
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

      if (!isHoopPlaced) {
        const euler = new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ');
        const isAligned = Math.abs(euler.x) < 0.15;

        onStateChange({
          isDeviceAligned: isAligned,
          isHoopPlaced: false,
        });

        if (isAligned && ballModelTemplate && isHoopModelLoaded) {
          spawnHoopForRound(1);
          resetBall();
        }
        return;
      }

      if (isHoopPlaced) {
        const elapsedTime = clock.getElapsedTime();
        
        if (gameMode === 'multi') {
          subHoops.forEach(sh => {
            if (sh.amplitude > 0) {
              const offset = Math.sin(elapsedTime * sh.speed + sh.phase) * sh.amplitude;
              const localOffset = new THREE.Vector3(offset, 0, 0);
              localOffset.applyQuaternion(sh.group.quaternion);
              sh.group.position.copy(sh.basePosition).add(localOffset);
            }
          });
        } else if (gameMode === 'normal' && currentRound === 3) {
          const offset = Math.sin(elapsedTime * 1.5) * 0.6;
          const localOffset = new THREE.Vector3(offset, 0, 0);
          localOffset.applyQuaternion(hoopGroup.quaternion);
          hoopGroup.position.copy(hoopBasePosition).add(localOffset);
        } else if (difficulty === 'hard') {
          const localOffset = new THREE.Vector3(
            Math.sin(elapsedTime * 1.0) * 0.5,
            Math.cos(elapsedTime * 1.3) * 0.2,
            0
          );
          localOffset.applyQuaternion(hoopGroup.quaternion);
          hoopGroup.position.copy(hoopBasePosition).add(localOffset);
        }
      }

      if (isHoopPlaced) {
        if (gameMode === 'fade') {
          if (!isBallThrown) {
            fadeTimer -= dt;
            const pct = Math.max(0, fadeTimer / 3.5);
            
            const indicator = hoopGroup.getObjectByName("fade-indicator-ring") as THREE.Mesh;
            if (indicator) {
              const mat = indicator.material as any;
              if (pct > 0.6) {
                mat.color.setHex(0x22c55e);
              } else if (pct > 0.25) {
                mat.color.setHex(0xeab308);
              } else {
                mat.color.setHex(0xef4444);
              }
            }

            onStateChange({ timeLeft: parseFloat(fadeTimer.toFixed(1)) });

            if (fadeTimer <= 0) {
              spawnHoopForRound(currentRound);
              resetBall();
            }
          }
        } else if (gameMode === 'time_attack') {
          timeLeft -= dt;
          onStateChange({ timeLeft: Math.max(0, Math.ceil(timeLeft)) });
          
          if (timeLeft <= 0) {
            timeLeft = 0;
            ballsLeft = 0;
            onStateChange({ status: 'idle', ballsLeft: 0, currentRound: 3, timeLeft: 0 });
            return;
          }
        }
      }

      if (!ballMesh) return;

      if (isBallThrown) {
        ballVelocity.y -= gravity * dt;

        if (gameMode === 'wind') {
          const windForce = windDirection === 'right' ? windSpeed : -windSpeed;
          ballVelocity.x += windForce * 0.16 * dt;
        }

        ballMesh.position.addScaledVector(ballVelocity, dt);

        checkBackboardCollision();
        checkRingCollision();
        checkScore();

        if (ballMesh.position.y < ballRadius && ballVelocity.y < 0) {
          if (Math.abs(ballVelocity.y) > 1.2) {
            ballMesh.position.y = ballRadius;
            ballVelocity.y = -ballVelocity.y * 0.85;
            ballVelocity.x *= 0.95;
            ballVelocity.z *= 0.95;
          } else {
            ballVelocity.set(0, 0, 0);
            if (!hasScoredThisThrow) {
              onStateChange({ status: 'missed' });
              if (gameMode === 'time_attack') {
                combo = 0;
                onStateChange({ combo });
              }
            }
            isBallThrown = false;

            if (gameMode === 'time_attack') {
              setTimeout(() => {
                resetBall();
              }, 400);
            } else if (gameMode === 'fade') {
              setTimeout(() => {
                spawnHoopForRound(currentRound);
                resetBall();
              }, 800);
            } else {
              ballsLeft -= 1;
              setTimeout(() => {
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
              }, 1200);
            }
          }
        }

        if (ballMesh.position.y < -3.0 || ballMesh.position.z < -12.0 || ballMesh.position.z > 5.0) {
          if (!hasScoredThisThrow) {
            onStateChange({ status: 'missed' });
            if (gameMode === 'time_attack') {
              combo = 0;
              onStateChange({ combo });
            }
          }
          isBallThrown = false;

          if (gameMode === 'time_attack') {
            setTimeout(() => {
              resetBall();
            }, 400);
          } else if (gameMode === 'fade') {
            setTimeout(() => {
              spawnHoopForRound(currentRound);
              resetBall();
            }, 800);
          } else {
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
        }
      } else {
        if (isDragging) {
          const localPos = getLocalProjectedPosition(dragScreenX, dragScreenY, camera);
          currentLocalPos.copy(localPos);
          ballMesh.position.copy(currentLocalPos);

          calculateExpectedVelocity(camera);
        } else {
          ballMesh.position.set(0, -0.15, -0.4);
        }

        ballMesh.rotateY(1.0 * dt);
        ballMesh.rotateX(0.5 * dt);

        if (isDragging && trajectoryPoints.length > 0) {
          const maxPoints = 20;
          const simDt = 0.065;

          const tempPos = new THREE.Vector3();
          ballMesh.getWorldPosition(tempPos);
          const tempVel = new THREE.Vector3().copy(expectedVelocity);
          let activeCount = 0;

          for (let i = 0; i < maxPoints; i++) {
            const sphere = trajectoryPoints[i];
            sphere.position.copy(tempPos);
            sphere.visible = true;
            activeCount++;

            tempVel.y -= gravity * simDt;
            if (gameMode === 'wind') {
              const windForce = windDirection === 'right' ? windSpeed : -windSpeed;
              tempVel.x += windForce * 0.16 * simDt;
            }
            tempPos.addScaledVector(tempVel, simDt);

            if (tempVel.y < -3.0 || tempPos.y < 0) {
              break;
            }
          }

          for (let i = activeCount; i < maxPoints; i++) {
            trajectoryPoints[i].visible = false;
          }
        }
      }
    }
  };
};
