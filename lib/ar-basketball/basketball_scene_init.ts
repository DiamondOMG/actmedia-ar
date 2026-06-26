import * as THREE from 'three';

declare const XR8: any;

export interface GameState {
  score: number;
  ballsLeft: number;
  status: 'idle' | 'aiming' | 'thrown' | 'scored' | 'missed';
}

export const initBasketballScenePipelineModule = (onStateChange: (state: Partial<GameState>) => void) => {
  let scene: THREE.Scene;
  let camera: THREE.Camera;
  const clock = new THREE.Clock();

  // เกมสเตต
  let score = 0;
  let ballsLeft = 10;
  let gameStatus: 'idle' | 'thrown' = 'idle';

  // 3D Objects
  let hoopGroup: THREE.Group;
  let backboard: THREE.Mesh;
  let ring: THREE.Mesh;
  let ball: THREE.Mesh | null = null;

  // Physics params
  const gravity = -9.8; // m/s^2
  const ballRadius = 0.18; // รัศมีลูกบาสประมาณ 18cm
  const ringRadius = 0.28; // รัศมีห่วงประมาณ 28cm (ห่วงต้องใหญ่กว่าลูกบาส)
  const ringHeight = 1.8;  // ความสูงของห่วง
  const hoopZ = -3.5;      // ระยะห่างของห่วงจากจุดเริ่ม

  let ballVelocity = new THREE.Vector3(0, 0, 0);
  let ballPosition = new THREE.Vector3(0, 0, 0);
  let hasScoredThisThrow = false;

  // วาดแป้นและห่วงบาสเกตบอล
  const createHoop = (): THREE.Group => {
    const hoop = new THREE.Group();

    // 1. เสาแป้นบาส
    const postGeo = new THREE.CylinderGeometry(0.05, 0.05, 3, 16);
    const postMat = new THREE.MeshStandardMaterial({ color: 0x444444, metalness: 0.8, roughness: 0.2 });
    const post = new THREE.Mesh(postGeo, postMat);
    post.position.set(0, 1.5, -0.1);
    hoop.add(post);

    // 2. แป้น (Backboard)
    const boardGeo = new THREE.BoxGeometry(1.5, 1.0, 0.05);
    const boardMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 });
    backboard = new THREE.Mesh(boardGeo, boardMat);
    backboard.position.set(0, 2.3, 0);
    hoop.add(backboard);

    // วาดขอบแดงรอบแป้น
    const borderGeo = new THREE.BoxGeometry(0.6, 0.45, 0.06);
    const borderMat = new THREE.MeshStandardMaterial({ color: 0xd93838, roughness: 0.5 });
    const borderInner = new THREE.Mesh(borderGeo, borderMat);
    borderInner.position.set(0, 2.1, 0);
    hoop.add(borderInner);

    // 3. ห่วง (Ring)
    const ringGeo = new THREE.TorusGeometry(ringRadius, 0.015, 8, 24);
    const ringMat = new THREE.MeshStandardMaterial({ color: 0xff5500, metalness: 0.5, roughness: 0.1 });
    ring = new THREE.Mesh(ringGeo, ringMat);
    // วงกลมห่วงต้องนอนระนาบ XZ
    ring.rotation.x = Math.PI / 2;
    ring.position.set(0, ringHeight, 0.35); // ยื่นมาข้างหน้าแป้นเล็กน้อย
    hoop.add(ring);

    // 4. ตาข่าย (Net) แบบจำลองโปร่งแสง
    const netGeo = new THREE.CylinderGeometry(ringRadius, ringRadius * 0.7, 0.4, 16, 1, true);
    const netMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.4,
      wireframe: true
    });
    const net = new THREE.Mesh(netGeo, netMat);
    net.position.set(0, ringHeight - 0.2, 0.35);
    hoop.add(net);

    return hoop;
  };

  // โยนลูกบาส
  const throwBall = () => {
    if (gameStatus === 'thrown' || ballsLeft <= 0) return;

    gameStatus = 'thrown';
    ballsLeft -= 1;
    hasScoredThisThrow = false;
    onStateChange({ status: 'thrown', ballsLeft });

    // สร้างลูกบาสใหม่ตรงตำแหน่งกล้อง (หรือเยื้องมาข้างหน้านิดนึง)
    const cameraDir = new THREE.Vector3();
    camera.getWorldDirection(cameraDir);

    const spawnPos = new THREE.Vector3();
    camera.getWorldPosition(spawnPos);
    // ขยับลูกบาสไปข้างหน้ากล้องนิดหน่อย เพื่อไม่ให้ซ้อนทับกล้องพอดี
    spawnPos.addScaledVector(cameraDir, 0.3);

    if (ball) {
      scene.remove(ball);
      ball.geometry.dispose();
      if (Array.isArray(ball.material)) {
        ball.material.forEach(m => m.dispose());
      } else {
        ball.material.dispose();
      }
    }

    const ballGeo = new THREE.SphereGeometry(ballRadius, 32, 32);
    // ลายลูกบาสสีส้มสะท้อนแสง
    const ballMat = new THREE.MeshStandardMaterial({
      color: 0xe65c00,
      roughness: 0.8,
      metalness: 0.1,
    });
    ball = new THREE.Mesh(ballGeo, ballMat);
    ball.position.copy(spawnPos);
    scene.add(ball);

    // กำหนดความเร็วเริ่มต้น (ขึ้นอยู่กับทิศทางกล้อง + แรงผลักไปข้างหน้าและขึ้นบน)
    ballPosition.copy(spawnPos);
    // คำนวณความแรงในการโยน (ปรับแต่งให้เข้ากับระยะห่างของห่วง)
    const forwardForce = 7.5;
    const upwardForce = 4.2;

    ballVelocity.copy(cameraDir).multiplyScalar(forwardForce);
    ballVelocity.y += upwardForce; // เสริมแรงส่งขึ้นสูงเพื่อให้โค้งลงห่วง
  };

  return {
    name: 'basketball-scene-init',
    onStart: ({ canvasWidth, canvasHeight }: any) => {
      const { scene: xrScene, camera: xrCamera } = XR8.Threejs.xrScene();
      scene = xrScene;
      camera = xrCamera;

      // เพิ่มแสงสว่าง
      const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
      scene.add(ambientLight);

      const dirLight = new THREE.DirectionalLight(0xffffff, 0.6);
      dirLight.position.set(5, 10, 7);
      scene.add(dirLight);

      // สร้างและวางแป้นบาส
      hoopGroup = createHoop();
      hoopGroup.position.set(0, 0, hoopZ); // วางไว้ข้างหน้ากล้อง 3.5 เมตร
      scene.add(hoopGroup);

      // ตั้งค่าขนาดหน้าจอ 8th Wall
      XR8.Threejs.configureFrame();

      // ส่ง Event โหลดเกมเสร็จสิ้น
      onStateChange({ score, ballsLeft, status: 'idle' });

      // ผูก Event การคลิกเพื่อโยน
      const handleCanvasClick = (e: MouseEvent | TouchEvent) => {
        throwBall();
      };
      window.addEventListener('click', handleCanvasClick);
      window.addEventListener('touchstart', handleCanvasClick);

      // บันทึกฟังก์ชันทำลายลงบน window เพื่อล้าง event ตอนปิดหน้าจอ
      (window as any)._cleanupBasketball = () => {
        window.removeEventListener('click', handleCanvasClick);
        window.removeEventListener('touchstart', handleCanvasClick);
        if (ball) {
          scene.remove(ball);
        }
        scene.remove(hoopGroup);
      };
    },
    onUpdate: () => {
      const dt = clock.getDelta();

      if (gameStatus === 'thrown' && ball) {
        // 1. อัปเดตตำแหน่งตามกฎฟิสิกส์อย่างง่าย (Gravity)
        ballVelocity.y += gravity * dt;
        ballPosition.addScaledVector(ballVelocity, dt);
        ball.position.copy(ballPosition);

        // คำนวณพิกัดห่วงแบบ Absolute ใน World Space
        const worldHoopPos = new THREE.Vector3();
        ring.getWorldPosition(worldHoopPos);

        const worldBoardPos = new THREE.Vector3();
        backboard.getWorldPosition(worldBoardPos);

        // 2. เช็คการชนแป้นบาส (Backboard Collision)
        const distToBoardZ = Math.abs(ballPosition.z - worldBoardPos.z);
        if (
          distToBoardZ < (ballRadius + 0.025) &&
          ballPosition.y > (worldBoardPos.y - 0.5) &&
          ballPosition.y < (worldBoardPos.y + 0.5) &&
          Math.abs(ballPosition.x - worldBoardPos.x) < 0.75 &&
          ballVelocity.z > 0 // เคลื่อนที่ไปข้างหน้าชนแป้น
        ) {
          ballVelocity.z = -ballVelocity.z * 0.5; // เด้งสะท้อนกลับ Z
          ballVelocity.x += (ballPosition.x - worldBoardPos.x) * 2; // เด้งแฉลบ
          ballPosition.z = worldBoardPos.z - (ballRadius + 0.03);
        }

        // 3. ตรวจจับการชนขอบห่วง (Ring Collision)
        const dx = ballPosition.x - worldHoopPos.x;
        const dz = ballPosition.z - worldHoopPos.z;
        const horizDistToRingCenter = Math.sqrt(dx * dx + dz * dz);
        const verticalDistToRing = Math.abs(ballPosition.y - worldHoopPos.y);

        if (
          verticalDistToRing < ballRadius &&
          Math.abs(horizDistToRingCenter - ringRadius) < 0.05
        ) {
          const bounceDir = new THREE.Vector3(dx, 0.2, dz).normalize();
          ballVelocity.addScaledVector(bounceDir, 2.5);
          ballVelocity.y = Math.abs(ballVelocity.y) * 0.4;
        }

        // 4. ตรวจจับการโยนบาสลงห่วง (Goal Detection!)
        if (
          !hasScoredThisThrow &&
          ballVelocity.y < 0 &&
          ballPosition.y <= worldHoopPos.y &&
          (ballPosition.y - ballVelocity.y * dt) > worldHoopPos.y &&
          horizDistToRingCenter < ringRadius
        ) {
          score += 1;
          hasScoredThisThrow = true;
          onStateChange({ score, status: 'scored' });
        }

        // 5. เช็คเมื่อลูกบาสตกดินหรือเลยออกนอกกรอบสายตาเพื่อรีเซ็ต
        if (ballPosition.y < -1.5 || ballPosition.length() > 15) {
          gameStatus = 'idle';
          if (!hasScoredThisThrow) {
            onStateChange({ status: 'missed' });
          } else {
            onStateChange({ status: 'idle' });
          }
        }
      }
    }
  };
};
