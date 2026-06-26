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
  const ringHeight = 1.8;
  const hoopZ = -3.0; // วางห่างออกไป 3 เมตร

  // วาดแป้นและห่วงบาสเกตบอลแบบง่ายๆ
  const createSimpleHoop = (): THREE.Group => {
    const hoop = new THREE.Group();

    // 1. เสาแป้นบาส
    const postGeo = new THREE.CylinderGeometry(0.04, 0.04, 2.5, 16);
    const postMat = new THREE.MeshStandardMaterial({ color: 0x555555, metalness: 0.5 });
    const post = new THREE.Mesh(postGeo, postMat);
    post.position.set(0, 1.25, -0.1);
    hoop.add(post);

    // 2. แป้น (Backboard)
    const boardGeo = new THREE.BoxGeometry(1.2, 0.8, 0.04);
    const boardMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8 });
    const board = new THREE.Mesh(boardGeo, boardMat);
    board.position.set(0, 2.0, 0);
    hoop.add(board);

    // 3. ห่วง (Ring) สีส้ม
    const ringGeo = new THREE.TorusGeometry(ringRadius, 0.015, 8, 24);
    const ringMat = new THREE.MeshStandardMaterial({ color: 0xff5500, roughness: 0.2 });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.set(0, ringHeight, 0.3); // ยื่นออกมาหน้าแป้น
    hoop.add(ring);

    // 4. ตาข่ายแบบเส้นลวดจำลอง
    const netGeo = new THREE.CylinderGeometry(ringRadius, ringRadius * 0.7, 0.35, 12, 1, true);
    const netMat = new THREE.MeshBasicMaterial({ color: 0xaaaaaa, wireframe: true, transparent: true, opacity: 0.6 });
    const net = new THREE.Mesh(netGeo, netMat);
    net.position.set(0, ringHeight - 0.175, 0.3);
    hoop.add(net);

    return hoop;
  };

  return {
    name: 'basketball-scene-init',
    onStart: () => {
      const { scene: xrScene } = XR8.Threejs.xrScene();
      scene = xrScene;

      // 1. เพิ่มแสง
      const ambientLight = new THREE.AmbientLight(0xffffff, 0.9);
      scene.add(ambientLight);

      const dirLight = new THREE.DirectionalLight(0xffffff, 0.5);
      dirLight.position.set(5, 8, 5);
      scene.add(dirLight);

      // 2. สร้างห่วงบาสลอยกลางอากาศ
      hoopGroup = createSimpleHoop();
      hoopGroup.position.set(0, 0, hoopZ);
      scene.add(hoopGroup);

      // ส่งสถานะเริ่มต้นกลับไป UI
      onStateChange({ score: 0, ballsLeft: 10, status: 'idle' });

      // ทำความสะอาดเมื่อปิดหน้าจอ
      (window as any)._cleanupBasketball = () => {
        if (hoopGroup) {
          scene.remove(hoopGroup);
        }
      };
    },
    onUpdate: () => {
      // ไม่มีฟิสิกส์ในเวอร์ชันลอยกลางอากาศธรรมดา
    }
  };
};
