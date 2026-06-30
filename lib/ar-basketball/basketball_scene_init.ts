import * as THREE from 'three';
 
declare const XR8: any;
 
export interface GameState {
  score: number;
  ballsLeft: number;
  status: 'idle' | 'aiming' | 'thrown' | 'scored' | 'missed';
  isHoopPlaced?: boolean;
  isDeviceAligned?: boolean;
}
 
export const initBasketballScenePipelineModule = (onStateChange: (state: Partial<GameState>) => void) => {
  let scene: THREE.Scene;
  let hoopGroup: THREE.Group;
  let trajectoryLine: THREE.Line | null = null;
  const clock = new THREE.Clock();
 
  // ตัวแปรด้านการควบคุมฟิสิกส์และสถานะเกม
  let ballMesh: THREE.Mesh | null = null;
  const ballVelocity = new THREE.Vector3();
  let isBallThrown = false;
  let isHoopPlaced = false;
  let ballsLeft = 10;
  let score = 0;
  let hasScoredThisThrow = false;
  let canScore = false; // ตรวจสอบว่าผ่านห่วงจากบนลงล่างเท่านั้น
 
  // เพิ่มเติม: ตัวแปรสำหรับการเล็งในลูป update
  let isAiming = false;
  let currentDy = 0;
 
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
 
  // 4. รีเซ็ตลูกบอลลูกใหม่
  const resetBall = () => {
    if (!isHoopPlaced) return;
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
 
  // 5. ตรวจจับการชนแป้นบาส (Vertical Plane Backboard)
  const checkBackboardCollision = () => {
    if (!ballMesh) return;
 
    const boardX = hoopGroup.position.x;
    const boardY = hoopGroup.position.y + 0.4;
    const boardZ = hoopGroup.position.z;
 
    const halfWidth = 0.6;
    const halfHeight = 0.4;
    const thickness = 0.03;
 
    // แปลงตำแหน่งบาสเข้าสู่ระบบพิกัด Local ของ HoopGroup เพื่อเช็คชนแป้นที่หมุนแล้วได้อย่างถูกต้อง
    const localBallPos = ballMesh.position.clone().sub(hoopGroup.position);
    localBallPos.applyQuaternion(hoopGroup.quaternion.clone().invert());
 
    // พิกัดแป้นบาสหลังหมุนจะขนานกับแกน X และ Y ในพิกัด Local เสมอ
    const withinX = localBallPos.x >= -halfWidth && localBallPos.x <= halfWidth;
    const withinY = localBallPos.y >= 0.4 - halfHeight && localBallPos.y <= 0.4 + halfHeight;
 
    if (withinX && withinY) {
      // หน้าแป้นบาสจะหันไปทิศ +Z ในพิกัด Local ของกลุ่ม (เนื่องจากเรา lookAt และหมุน 180)
      const collisionLocalZ = thickness / 2 + ballRadius;
      
      // เมื่อแกน Z ของบาสต่ำกว่าระยะหน้าแป้น และความเร็วพุ่งเข้าหาแป้น (Local Velocity Z < 0)
      const localVelocity = ballVelocity.clone().applyQuaternion(hoopGroup.quaternion.clone().invert());
 
      if (localBallPos.z <= collisionLocalZ && localBallPos.z >= -thickness && localVelocity.z < 0) {
        localBallPos.z = collisionLocalZ;
        localVelocity.z = -localVelocity.z * 0.55; // สะท้อนและดูดซับแรงกระแทก
        localVelocity.x *= 0.8;
 
        // แปลงความเร็วและตำแหน่งกลับเข้าสู่พิกัดโลก
        ballMesh.position.copy(localBallPos).applyQuaternion(hoopGroup.quaternion).add(hoopGroup.position);
        ballVelocity.copy(localVelocity).applyQuaternion(hoopGroup.quaternion);
      }
    }
  };
 
  // 6. ตรวจจับการชนขอบห่วงแบบวงแหวน (Invisible Ring Hitbox - Torus Collision)
  const checkRingCollision = () => {
    if (!ballMesh) return;
 
    // พิกัดโลกของห่วงบาสที่ผ่านการหมุนแล้ว
    const ringLocalOffset = new THREE.Vector3(0, 0.1, 0.35);
    const ringCenter = ringLocalOffset.clone().applyQuaternion(hoopGroup.quaternion).add(hoopGroup.position);
 
    const ballPos = ballMesh.position;
 
    // หาระยะห่างทางราบ (ระนาบแบนของห่วงบาสที่หมุนตามแป้น)
    // สำหรับแป้นบาสที่หมุนแนว Y ระยะห่าง XZ สะท้อนถึงระยะราบในระบบพิกัดโลกได้
    const dx = ballPos.x - ringCenter.x;
    const dz = ballPos.z - ringCenter.z;
    const distXZ = Math.sqrt(dx * dx + dz * dz);
 
    if (distXZ > 0.001) {
      const dirX = dx / distXZ;
      const dirZ = dz / distXZ;
 
      const closestX = ringCenter.x + dirX * ringRadius;
      const closestZ = ringCenter.z + dirZ * ringRadius;
      // ความสูงของห่วงตามความสูงจริงของกลุ่มห่วงบาส
      const closestPointOnRing = new THREE.Vector3(closestX, ringCenter.y, closestZ);
 
      const distance3D = ballPos.distanceTo(closestPointOnRing);
      const collisionThreshold = ballRadius + 0.015; // รัศมีลูกบาส + ความหนาเหล็กห่วง
 
      if (distance3D < collisionThreshold) {
        const normal = new THREE.Vector3().subVectors(ballPos, closestPointOnRing).normalize();
        // แก้ไขไม่ให้วัตถุทะลุเข้าไปในโมเดล (Anti-penetration)
        ballMesh.position.copy(closestPointOnRing).addScaledVector(normal, collisionThreshold);
 
        const dot = ballVelocity.dot(normal);
        if (dot < 0) {
          ballVelocity.addScaledVector(normal, -(1 + 0.5) * dot); // เด้งสะท้อนด้วย bounciness 0.5
        }
      }
    }
  };
 
  // 7. ตรวจจับการชู้ตทำคะแนน
  const checkScore = () => {
    if (!ballMesh || hasScoredThisThrow) return;
 
    const ringLocalOffset = new THREE.Vector3(0, 0.1, 0.35);
    const ringCenter = ringLocalOffset.clone().applyQuaternion(hoopGroup.quaternion).add(hoopGroup.position);
 
    const ballPos = ballMesh.position;
    const dx = ballPos.x - ringCenter.x;
    const dz = ballPos.z - ringCenter.z;
    const distXZ = Math.sqrt(dx * dx + dz * dz);
 
    // เริ่มเปิดสิทธิ์ทำคะแนนเมื่อลูกบาสลอยอยู่เหนือระนาบห่วงและตรงช่องห่วง
    if (distXZ < ringRadius && ballPos.y > ringCenter.y) {
      canScore = true;
    }
 
    // ทำคะแนนเมื่อเคลื่อนที่ลอดผ่านระนาบจากบนลงล่างสำเร็จ
    if (canScore && ballPos.y <= ringCenter.y && distXZ < ringRadius && ballVelocity.y < 0) {
      hasScoredThisThrow = true;
      canScore = false;
      score += 1;
      onStateChange({ score, status: 'scored' });
    }
  };
 
  // ฟังก์ชันคำนวณเวกเตอร์ความเร็วจากระยะการลากแกน Y
  const getVelocityFromDy = (dy: number, camera: any): THREE.Vector3 => {
    const maxDy = window.innerHeight * 0.5; // จำกัดขอบเขตลากสูงสุดที่ครึ่งจอภาพ
    const ratio = Math.min(Math.max(dy / maxDy, 0.1), 1.0);
 
    // แกน X เป็น 0 เสมอตามการตัดสินใจของผู้ใช้ (เล็งด้วยการหมุนส่องกล้องแทน)
    const tX = 0;
    // แกน Y (ความสูงวิถีย้อย): ยืดหยุ่นตามระยะลาก (4.0 ถึง 8.5)
    const tY = 4.0 + ratio * 4.5;
    // แกน Z (แรงส่งแนวลึก): ยืดหยุ่นตามระยะลาก (-4.5 ถึง -9.0)
    const tZ = -4.5 - ratio * 4.5;
 
    const localVelocity = new THREE.Vector3(tX, tY, tZ);
    // แปลงความเร็วตามพิกัดทิศของกล้องจริงในโลก 3D
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
      ballsLeft = 10;
      score = 0;
      isHoopPlaced = false;
      clock.getDelta();
 
      onStateChange({
        score: 0,
        ballsLeft: 10,
        status: 'idle',
        isHoopPlaced: false,
        isDeviceAligned: false,
      });
 
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
        // ตรวจเช็คว่าเครื่องตั้งฉากกับโลกขนานแนวดิ่ง (Pitch เอียงก้มเงยอยู่ในช่วง ±0.15 เรเดียน หรือประมาณ ±8.5 องศา)
        const isAligned = Math.abs(euler.x) < 0.15;
 
        onStateChange({
          isDeviceAligned: isAligned,
          isHoopPlaced: false,
        });
 
        if (isAligned) {
          // เสกแป้นบาสตรงหน้ากล้องระยะ 3 เมตร
          const hoopPos = new THREE.Vector3(0, 0, hoopZ);
          hoopPos.applyQuaternion(camera.quaternion);
          hoopGroup.position.copy(camera.position).add(hoopPos);
 
          // บังคับความสูง Y ให้สปอว์นที่ระดับระดับสายตา 1.6 เมตรของโลก
          hoopGroup.position.y = 1.6;
 
          // หมุนหันหน้าของแป้นบาสเข้าหาตำแหน่งกล้อง (แนวระนาบ XZ)
          const camLookPos = new THREE.Vector3(camera.position.x, hoopGroup.position.y, camera.position.z);
          hoopGroup.lookAt(camLookPos);
 
          scene.add(hoopGroup);
          isHoopPlaced = true;
 
          onStateChange({ isHoopPlaced: true });
          resetBall();
        }
        return;
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
