import * as THREE from 'three';
 
declare const XR8: any;
 
export interface GameState {
  score: number;
  ballsLeft: number;
  status: 'idle' | 'aiming' | 'thrown' | 'scored' | 'missed';
}
 
export const initBasketballScenePipelineModule = (onStateChange: (state: Partial<GameState>) => void) => {
  let scene: THREE.Scene;
  let hoopGroup: THREE.Group;
  const clock = new THREE.Clock();
 
  // ตัวแปรด้านการควบคุมฟิสิกส์และสถานะเกม
  let ballMesh: THREE.Mesh | null = null;
  const ballVelocity = new THREE.Vector3();
  let isBallThrown = false;
  let ballsLeft = 10;
  let score = 0;
  let hasScoredThisThrow = false;
  let canScore = false; // ตรวจสอบว่าผ่านห่วงจากบนลงล่างเท่านั้น
 
  const ballRadius = 0.12;
  const ringRadius = 0.28;
  const gravity = 9.81;
  const hoopZ = -3.0; // วางห่างออกไป 3 เมตร
 
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
 
  // 2. สร้าง Mesh ลูกบาสเกตบอล 3D
  const createBasketballMesh = (): THREE.Mesh => {
    const geo = new THREE.SphereGeometry(ballRadius, 24, 24);
    const mat = new THREE.MeshStandardMaterial({
      color: 0xff5500,
      roughness: 0.7,
      metalness: 0.1,
    });
    const ball = new THREE.Mesh(geo, mat);
    ball.castShadow = true;
    return ball;
  };
 
  // 3. รีเซ็ตลูกบอลลูกใหม่
  const resetBall = () => {
    if (ballsLeft <= 0) {
      onStateChange({ status: 'idle', ballsLeft: 0 });
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
 
    onStateChange({ status: 'idle', ballsLeft });
  };
 
  // 4. ตรวจจับการชนแป้นบาส (Vertical Plane Backboard)
  const checkBackboardCollision = () => {
    if (!ballMesh) return;
 
    const boardX = hoopGroup.position.x;
    const boardY = hoopGroup.position.y + 0.4;
    const boardZ = hoopGroup.position.z;
 
    const halfWidth = 0.6;
    const halfHeight = 0.4;
    const thickness = 0.03;
 
    const withinX = ballMesh.position.x >= boardX - halfWidth && ballMesh.position.x <= boardX + halfWidth;
    const withinY = ballMesh.position.y >= boardY - halfHeight && ballMesh.position.y <= boardY + halfHeight;
 
    if (withinX && withinY) {
      const collisionZ = boardZ + thickness / 2 + ballRadius;
      if (ballMesh.position.z <= collisionZ && ballVelocity.z < 0) {
        ballMesh.position.z = collisionZ;
        ballVelocity.z = -ballVelocity.z * 0.55; // สะท้อนกลับพร้อมสูญเสียแรงกระแทก
        ballVelocity.x *= 0.8;
      }
    }
  };
 
  // 5. ตรวจจับการชนขอบห่วงแบบวงแหวน (Invisible Ring Hitbox - Torus Collision)
  const checkRingCollision = () => {
    if (!ballMesh) return;
 
    const ringX = hoopGroup.position.x;
    const ringY = hoopGroup.position.y + 0.1;
    const ringZ = hoopGroup.position.z + 0.35;
 
    const ballPos = ballMesh.position;
    const dx = ballPos.x - ringX;
    const dz = ballPos.z - ringZ;
    const distXZ = Math.sqrt(dx * dx + dz * dz);
 
    if (distXZ > 0.001) {
      const dirX = dx / distXZ;
      const dirZ = dz / distXZ;
 
      const closestX = ringX + dirX * ringRadius;
      const closestZ = ringZ + dirZ * ringRadius;
      const closestPointOnRing = new THREE.Vector3(closestX, ringY, closestZ);
 
      const distance3D = ballPos.distanceTo(closestPointOnRing);
      const collisionThreshold = ballRadius + 0.015; // รัศมีลูกบาส + ความหนาเหล็กห่วง
 
      if (distance3D < collisionThreshold) {
        const normal = new THREE.Vector3().subVectors(ballPos, closestPointOnRing).normalize();
        // แก้ไขไม่ให้วัตถุทะลุเข้าไปในโมเดล (Anti-penetration)
        ballMesh.position.copy(closestPointOnRing).addScaledVector(normal, collisionThreshold);
 
        const dot = ballVelocity.dot(normal);
        if (dot < 0) {
          ballVelocity.addScaledVector(normal, -(1 + 0.5) * dot); // เด้งสะท้อนด้วยสัมประสิทธิ์ bounciness 0.5
        }
      }
    }
  };
 
  // 6. ตรวจจับการชู้ตทำคะแนน
  const checkScore = () => {
    if (!ballMesh || hasScoredThisThrow) return;
 
    const ringX = hoopGroup.position.x;
    const ringY = hoopGroup.position.y + 0.1;
    const ringZ = hoopGroup.position.z + 0.35;
 
    const ballPos = ballMesh.position;
    const dx = ballPos.x - ringX;
    const dz = ballPos.z - ringZ;
    const distXZ = Math.sqrt(dx * dx + dz * dz);
 
    // เริ่มเปิดสิทธิ์ทำคะแนนเมื่อลูกบาสลอยอยู่เหนือระนาบห่วงและตรงช่องห่วง
    if (distXZ < ringRadius && ballPos.y > ringY) {
      canScore = true;
    }
 
    // ทำคะแนนเมื่อเคลื่อนที่ลอดผ่านระนาบจากบนลงล่างสำเร็จ
    if (canScore && ballPos.y <= ringY && distXZ < ringRadius && ballVelocity.y < 0) {
      hasScoredThisThrow = true;
      canScore = false;
      score += 1;
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
      const ambientLight = new THREE.AmbientLight(0xffffff, 0.95);
      scene.add(ambientLight);
 
      const dirLight = new THREE.DirectionalLight(0xffffff, 0.45);
      dirLight.position.set(3, 8, 4);
      scene.add(dirLight);
 
      // วางห่วงบาสเก็ตบอล
      hoopGroup = createSimpleHoop();
      hoopGroup.position.set(0, 1.6, hoopZ);
      scene.add(hoopGroup);
 
      canvas.addEventListener('touchmove', (e: Event) => e.preventDefault());
 
      camera.position.set(0, 1.6, 0);
      XR8.XrController.updateCameraProjectionMatrix({
        origin: camera.position,
        facing: camera.quaternion,
      });
 
      const handleTouch = (e: TouchEvent) => {
        if (e.touches.length === 1 && !isBallThrown) {
          XR8.XrController.recenter();
        }
      };
      canvas.addEventListener('touchstart', handleTouch, true);
 
      // เพิ่มฟังก์ชันเรียกดีด/โยนลูกบาสจากภายนอก (React component)
      (window as any).throwBasketball = (velocity: THREE.Vector3) => {
        if (isBallThrown || ballsLeft <= 0) return;
        ballVelocity.copy(velocity);
        isBallThrown = true;
        onStateChange({ status: 'thrown' });
      };
 
      // เริ่มต้นสถานะเกมและสร้างลูกบอลลูกแรก
      ballsLeft = 10;
      score = 0;
      clock.getDelta(); // เคลียร์เวลาสะสม
      resetBall();
 
      (window as any)._cleanupBasketball = () => {
        if (hoopGroup) scene.remove(hoopGroup);
        if (ballMesh) scene.remove(ballMesh);
        canvas.removeEventListener('touchstart', handleTouch, true);
        delete (window as any).throwBasketball;
      };
    },
    onUpdate: () => {
      if (typeof XR8 === 'undefined') return;
      const { camera } = XR8.Threejs.xrScene();
      if (!camera || !ballMesh) return;
 
      const dt = Math.min(clock.getDelta(), 0.03); // ป้องกันบั๊กเวลาเฟรมเรตตกวูบ
 
      if (isBallThrown) {
        // อัปเดตตำแหน่งจากแรงโน้มถ่วง
        ballVelocity.y -= gravity * dt;
        ballMesh.position.addScaledVector(ballVelocity, dt);
 
        // คำนวณการชนและการนับคะแนน
        checkBackboardCollision();
        checkRingCollision();
        checkScore();
 
        // เช็คการตกพื้นดิน (Y < 0.12)
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
            setTimeout(resetBall, 1200);
          }
        }
 
        // หลุดขอบเขตออกไปไกลเกินไป
        if (ballMesh.position.y < -3.0 || ballMesh.position.z < -10.0 || ballMesh.position.z > 5.0) {
          if (!hasScoredThisThrow) {
            onStateChange({ status: 'missed' });
          }
          isBallThrown = false;
          ballsLeft -= 1;
          resetBall();
        }
      } else {
        // ซิงก์ตำแหน่งลูกบอลให้อยู่ติดกับกล้อง (เสมือนผู้ใช้ถือไว้เพื่อพร้อมปัดชู้ต)
        const offset = new THREE.Vector3(0, -0.15, -0.4);
        offset.applyQuaternion(camera.quaternion);
        ballMesh.position.copy(camera.position).add(offset);
      }
    }
  };
};
