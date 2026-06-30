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
  let trajectoryLine: THREE.Line | null = null;
  const clock = new THREE.Clock();
 
  // ตัวแปรด้านการควบคุมฟิสิกส์และสถานะเกม
  let ballMesh: THREE.Object3D | null = null;
  let ballModelTemplate: THREE.Object3D | null = null; // preloaded GLB
  const ballVelocity = new THREE.Vector3();
  let isBallThrown = false;
  let isHoopPlaced = false;
 
  // ระบบทัวร์นาเมนต์ 3 รอบ
  let currentRound = 1;
  let score = 0;       // คะแนนสะสมทั้งหมด
  let ballsLeft = 3;   // โอกาสโยนในรอบปัจจุบัน
 
  let hasScoredThisThrow = false;
  let canScore = false; // ตรวจสอบว่าผ่านห่วงจากบนลงล่างเท่านั้น
 
  // ตัวแปรสำหรับการเล็งในลูป update
  let isAiming = false;
  let currentDy = 0;
 
  // ตัวแปรปรับระดับความยาก Easy/Hard และตำแหน่งฐานแป้นบาส
  let difficulty: 'easy' | 'hard' = 'easy';
  const hoopBasePosition = new THREE.Vector3();
 
  const ballRadius = 0.06; // hitbox radius (เมตร)
  const ballModelScale = 0.062; // 0.06 / 0.97 (model radius)
  const ringRadius = 0.28;
  const gravity = 9.81;
 
  // 1. วาดแป้นและห่วงบาสเกตบอลแบบง่ายๆ
  const createSimpleHoop = (): THREE.Group => {
    const hoop = new THREE.Group();
 
    // แป้น (Backboard)
    const boardGeo = new THREE.BoxGeometry(1.2, 0.8, 0.03);
    const boardMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7 });
    const board = new THREE.Mesh(boardGeo, boardMat);
    board.position.set(0, 0.4, 0);
    hoop.add(board);
 
    // กรอบสีส้มบนแป้นบาส
    const borderGeo = new THREE.BoxGeometry(0.5, 0.35, 0.04);
    const borderMat = new THREE.MeshStandardMaterial({ color: 0xff5500, roughness: 0.5 });
    const border = new THREE.Mesh(borderGeo, borderMat);
    border.position.set(0, 0.25, 0.005);
    hoop.add(border);
 
    // ห่วง (Ring) สีส้ม
    const ringGeo = new THREE.TorusGeometry(ringRadius, 0.015, 8, 24);
    const ringMat = new THREE.MeshStandardMaterial({ color: 0xff5500, roughness: 0.2 });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.set(0, 0.1, 0.35); // ยื่นออกมาข้างหน้าแป้น
    hoop.add(ring);
 
    // ตาข่าย
    const netGeo = new THREE.CylinderGeometry(ringRadius, ringRadius * 0.7, 0.35, 12, 1, true);
    const netMat = new THREE.MeshBasicMaterial({ color: 0xeeeeee, wireframe: true, transparent: true, opacity: 0.7 });
    const net = new THREE.Mesh(netGeo, netMat);
    net.position.set(0, -0.075, 0.35);
    hoop.add(net);
 
    return hoop;
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
 
  // 3. สร้าง Line สำหรับจำลองวิถีโยนบาส (Trajectory Guide Line)
  const createTrajectoryLine = (): THREE.Line => {
    const maxPoints = 30;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(maxPoints * 3);
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
 
    const material = new THREE.LineBasicMaterial({
      color: 0xa855f7, // สีม่วงสดใส
      linewidth: 3,
      transparent: true,
      opacity: 0.85,
    });
 
    const line = new THREE.Line(geometry, material);
    line.visible = false;
    return line;
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
    const boardY = hoopGroup.position.y + 0.4;
    const boardZ = hoopGroup.position.z;
 
    const halfWidth = 0.6;
    const halfHeight = 0.4;
    const thickness = 0.03;
 
    const localBallPos = ballMesh.position.clone().sub(hoopGroup.position);
    localBallPos.applyQuaternion(hoopGroup.quaternion.clone().invert());
 
    const withinX = localBallPos.x >= -halfWidth && localBallPos.x <= halfWidth;
    const withinY = localBallPos.y >= 0.4 - halfHeight && localBallPos.y <= 0.4 + halfHeight;
 
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
      onStateChange({ score, status: 'scored' });
    }
  };
 
  // ฟังก์ชันคำนวณเวกเตอร์ความเร็วจากระยะการลากแกน Y
  const getVelocityFromDy = (dy: number, camera: any): THREE.Vector3 => {
    const maxDy = window.innerHeight * 0.5;
    const cleanDy = Math.max(dy, 0);
    const ratio = Math.min(cleanDy / maxDy, 1.0);
 
    const tX = 0;
    // ปรับสเกลแรงยิงให้เริ่มต้นจากน้อยมากๆ (เมื่อแค่แตะ ratio = 0) และขยายขึ้นตามสัดส่วนการลาก
    const tY = 1.0 + ratio * 7.5;   // ช่วง 1.0 ถึง 8.5 m/s
    const tZ = -1.0 - ratio * 8.0;  // ช่วง -1.0 ถึง -9.0 m/s
 
    const localVelocity = new THREE.Vector3(tX, tY, tZ);
    return localVelocity.applyQuaternion(camera.quaternion);
  };
 
  return {
    name: 'basketball-scene-init',
    onStart: ({ canvas }: any) => {
      const { scene: xrScene, camera, renderer } = XR8.Threejs.xrScene();
      scene = xrScene;
 
      renderer.shadowMap.enabled = true;
 
      // เพิ่มแสงสว่าง
      const ambientLight = new THREE.AmbientLight(0xffffff, 0.95);
      scene.add(ambientLight);
 
      const dirLight = new THREE.DirectionalLight(0xffffff, 0.45);
      dirLight.position.set(3, 8, 4);
      scene.add(dirLight);
 
      // โหลดโครงสร้างแป้นบาสเก็ตบอล (รอสปอว์น)
      hoopGroup = createSimpleHoop();
 
      // ส่งสถานะเริ่มต้นการดาวน์โหลดโมเดล
      onStateChange({ isAssetLoaded: false, assetLoadProgress: 0 });
 
      // โหลดโมเดล GLB ลูกบาสเก็ตบอลล่วงหน้าพร้อมวัดเปอร์เซ็นต์โหลด
      new GLTFLoader().load(
        '/3d/throwing/basketball.glb',
        (gltf) => {
          ballModelTemplate = gltf.scene;
          onStateChange({ isAssetLoaded: true, assetLoadProgress: 100 });
        },
        (xhr) => {
          if (xhr.total > 0) {
            const percent = Math.round((xhr.loaded / xhr.total) * 100);
            onStateChange({ assetLoadProgress: percent });
          }
        },
        (error) => {
          console.error('Error loading basketball GLB, using fallback sphere:', error);
          onStateChange({ isAssetLoaded: true, assetLoadProgress: 100 });
        }
      );
 
      // โหลดโครงสร้างเส้นประวิถีโค้ง
      trajectoryLine = createTrajectoryLine();
      scene.add(trajectoryLine);
 
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
 
      // เพิ่มฟังก์ชันสำหรับ React สั่งเปิดระบบเล็ง
      (window as any).startAiming = () => {
        isAiming = true;
        currentDy = 0;
      };
 
      // อัปเดตระยะลากนิ้วระหว่างเล็ง
      (window as any).updateAimingDy = (dy: number) => {
        currentDy = dy;
      };
 
      // สั่งปิดระบบเล็งและซ่อนเส้นไกด์
      (window as any).stopAiming = () => {
        isAiming = false;
        if (trajectoryLine) {
          trajectoryLine.visible = false;
        }
      };
 
      // ฟังก์ชันสำหรับดึงเวกเตอร์ยิงอ้างอิง
      (window as any).getShootVelocity = (dy: number) => {
        const { camera: activeCamera } = XR8.Threejs.xrScene();
        return getShootVelocityFromWindow(dy, activeCamera);
      };
 
      const getShootVelocityFromWindow = (dy: number, activeCamera: any) => {
        return getVelocityFromDy(dy, activeCamera);
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
        if (trajectoryLine) scene.remove(trajectoryLine);
        canvas.removeEventListener('touchstart', handleTouch, true);
        delete (window as any).throwBasketball;
        delete (window as any).startAiming;
        delete (window as any).updateAimingDy;
        delete (window as any).stopAiming;
        delete (window as any).getShootVelocity;
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
 
        if (isAligned && ballModelTemplate) {
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
        // ซิงก์ตำแหน่งลูกบอลให้อยู่ติดกับกล้อง (เสมือนผู้ใช้ถือไว้เพื่อพร้อมปัดชู้ต)
        const offset = new THREE.Vector3(0, -0.15, -0.4);
        offset.applyQuaternion(camera.quaternion);
        ballMesh.position.copy(camera.position).add(offset);
 
        // หมุนลูกบอลช้าๆ ขณะรอการชู้ตเพื่อความสมจริง
        ballMesh.rotateY(1.0 * dt);
        ballMesh.rotateX(0.5 * dt);
 
        // อัปเดตและเรนเดอร์เส้นไกด์วิถีโค้งที่ 60fps ในลูปหลัก เพื่อให้หันตามมุมกล้องเรียลไทม์
        if (isAiming && trajectoryLine) {
          const worldVelocity = getVelocityFromDy(currentDy, camera);
          const positions = trajectoryLine.geometry.attributes.position.array as Float32Array;
          const maxPoints = 30;
          const simDt = 0.05;
 
          const tempPos = new THREE.Vector3().copy(ballMesh.position);
          const tempVel = new THREE.Vector3().copy(worldVelocity);
          let actualPointsCount = 0;
 
          for (let i = 0; i < maxPoints; i++) {
            positions[i * 3] = tempPos.x;
            positions[i * 3 + 1] = tempPos.y;
            positions[i * 3 + 2] = tempPos.z;
            actualPointsCount++;
 
            tempVel.y -= gravity * simDt;
            tempPos.addScaledVector(tempVel, simDt);
 
            if (tempVel.y < 0) {
              break;
            }
          }
 
          const lastIndex = actualPointsCount - 1;
          const lastX = positions[lastIndex * 3];
          const lastY = positions[lastIndex * 3 + 1];
          const lastZ = positions[lastIndex * 3 + 2];
          for (let i = actualPointsCount; i < maxPoints; i++) {
            positions[i * 3] = lastX;
            positions[i * 3 + 1] = lastY;
            positions[i * 3 + 2] = lastZ;
          }
 
          trajectoryLine.geometry.attributes.position.needsUpdate = true;
          trajectoryLine.geometry.setDrawRange(0, actualPointsCount);
          trajectoryLine.visible = true;
        }
      }
    }
  };
};
