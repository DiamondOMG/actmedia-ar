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

  const ringRadius = 0.28;
  const hoopZ = -3.0; // วางห่างออกไป 3 เมตร

  // วาดแป้นและห่วงบาสเกตบอลแบบง่ายๆ (เอาเสาออกเพื่อป้องกันขอบล่างหลุดจอ และปรับสเกลให้คลีนขึ้น)
  const createSimpleHoop = (): THREE.Group => {
    const hoop = new THREE.Group();

    // 1. แป้น (Backboard)
    const boardGeo = new THREE.BoxGeometry(1.2, 0.8, 0.03);
    const boardMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7 });
    const board = new THREE.Mesh(boardGeo, boardMat);
    board.position.set(0, 0.4, 0); // สูงจากจุดศูนย์กลางกลุ่ม
    hoop.add(board);

    // วาดกรอบสีส้มบนแป้นบาสเพื่อความสวยงาม
    const borderGeo = new THREE.BoxGeometry(0.5, 0.35, 0.04);
    const borderMat = new THREE.MeshStandardMaterial({ color: 0xff5500, roughness: 0.5 });
    const border = new THREE.Mesh(borderGeo, borderMat);
    border.position.set(0, 0.25, 0.005);
    hoop.add(border);

    // 2. ห่วง (Ring) สีส้ม
    const ringGeo = new THREE.TorusGeometry(ringRadius, 0.015, 8, 24);
    const ringMat = new THREE.MeshStandardMaterial({ color: 0xff5500, roughness: 0.2 });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.set(0, 0.1, 0.35); // ยื่นออกมาข้างหน้าแป้น
    hoop.add(ring);

    // 3. ตาข่าย
    const netGeo = new THREE.CylinderGeometry(ringRadius, ringRadius * 0.7, 0.35, 12, 1, true);
    const netMat = new THREE.MeshBasicMaterial({ color: 0xeeeeee, wireframe: true, transparent: true, opacity: 0.7 });
    const net = new THREE.Mesh(netGeo, netMat);
    net.position.set(0, -0.075, 0.35);
    hoop.add(net);

    return hoop;
  };

  return {
    name: 'basketball-scene-init',
    onStart: ({ canvas }: any) => {
      const { scene: xrScene, camera, renderer } = XR8.Threejs.xrScene();
      scene = xrScene;

      // ตั้งค่า shadow map
      renderer.shadowMap.enabled = true;

      // 1. เพิ่มแสงสว่าง
      const ambientLight = new THREE.AmbientLight(0xffffff, 0.95);
      scene.add(ambientLight);

      const dirLight = new THREE.DirectionalLight(0xffffff, 0.45);
      dirLight.position.set(3, 8, 4);
      scene.add(dirLight);

      // 2. สร้างห่วงบาสลอยกลางอากาศ (ปรับความสูง Y ไปที่ 1.2 เมตร เพื่อให้อยู่ในระดับสายตาอย่างเหมาะสม)
      hoopGroup = createSimpleHoop();
      hoopGroup.position.set(0, 1.2, hoopZ);
      scene.add(hoopGroup);

      // ป้องกันการลากนิ้วเลื่อนหน้าเว็บ
      canvas.addEventListener('touchmove', (e: Event) => e.preventDefault());

      // สำคัญมาก: อัปเดต Projection Matrix ของกล้องให้ตรงกับพิกเซลของมือถือจริง เพื่อไม่ให้ภาพบิดเบี้ยวหรือหลุดขอบจอ
      camera.position.set(0, 1.6, 0);
      XR8.XrController.updateCameraProjectionMatrix({
        origin: camera.position,
        facing: camera.quaternion,
      });

      // แตะหน้าจอเพื่อ Recentering ตำแหน่งเริ่มต้นใหม่
      const handleTouch = (e: TouchEvent) => {
        if (e.touches.length === 1) {
          XR8.XrController.recenter();
        }
      };
      canvas.addEventListener('touchstart', handleTouch, true);

      // ส่งสถานะเริ่มต้นกลับไป UI
      onStateChange({ score: 0, ballsLeft: 10, status: 'idle' });

      // ทำความสะอาดเมื่อปิดหน้าจอ
      (window as any)._cleanupBasketball = () => {
        if (hoopGroup) {
          scene.remove(hoopGroup);
        }
        canvas.removeEventListener('touchstart', handleTouch, true);
      };
    },
    onUpdate: () => {
      // ไม่มีอัปเดตฟิสิกส์สำหรับโหมดพรีวิว
    }
  };
};
