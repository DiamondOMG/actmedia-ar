import * as THREE from 'three';
import { positionProvider } from './position-provider';
import { Waypoint } from './store-loader';

export interface ArrowOptions {
  color?: string | number;
  size?: number;
  animation?: 'bounce' | 'pulse' | 'none';
}

export class NavigationArrow {
  public scene: THREE.Scene;
  public mesh: THREE.Mesh;
  public targetRotation: number;
  public animationType: string;
  public time: number;
  public baseY: number;

  constructor(scene: THREE.Scene, options: ArrowOptions = {}) {
    this.scene = scene;
    const color = options.color || '#AD50FF';
    const size = options.size || 0.5;
    
    // สร้าง 3D Arrow (วาดบนระนาบ 2D แล้ว Extrude เป็น 3D)
    const shape = new THREE.Shape();
    shape.moveTo(0, 0.5 * size);
    shape.lineTo(0.3 * size, -0.2 * size);
    shape.lineTo(0.1 * size, -0.2 * size);
    shape.lineTo(0.1 * size, -0.5 * size);
    shape.lineTo(-0.1 * size, -0.5 * size);
    shape.lineTo(-0.1 * size, -0.2 * size);
    shape.lineTo(-0.3 * size, -0.2 * size);
    shape.lineTo(0, 0.5 * size);
    
    const extrudeSettings = { 
      depth: 0.05 * size, 
      bevelEnabled: true, 
      bevelSegments: 2, 
      steps: 1, 
      bevelSize: 0.02 * size, 
      bevelThickness: 0.02 * size 
    };
    
    const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
    
    // นอนลูกศรลงให้ขนานกับพื้น และจัดให้ปลายแหลมชี้ไปทาง +Z
    geometry.rotateX(Math.PI / 2);
    geometry.center();
    
    const material = new THREE.MeshStandardMaterial({ 
      color: new THREE.Color(color as THREE.ColorRepresentation),
      emissive: new THREE.Color(color as THREE.ColorRepresentation),
      emissiveIntensity: 0.3,
      roughness: 0.2,
      metalness: 0.5
    });
    
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.castShadow = true;
    
    // เริ่มต้นให้ลอยจากพื้น
    this.baseY = 0.5;
    this.mesh.position.set(0, this.baseY, -2);
    this.scene.add(this.mesh);
    
    this.targetRotation = 0;
    this.animationType = options.animation || 'bounce';
    this.time = 0;
  }
  
  setTarget(currentPosition: THREE.Vector3, targetWaypoint: Waypoint | null) {
    if (!targetWaypoint) return;
    
    const dx = targetWaypoint.x - currentPosition.x;
    const dz = targetWaypoint.z - currentPosition.z;
    
    let angle = Math.atan2(dx, dz);
    this.targetRotation = angle - positionProvider.headingOffsetRad;
  }
  
  updatePosition(cameraPosition: THREE.Vector3, cameraQuaternion: THREE.Quaternion) {
    const distance = 2.8;
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(cameraQuaternion);
    forward.y = 0;
    forward.normalize();
    
    const targetPos = cameraPosition.clone().add(forward.multiplyScalar(distance));
    
    this.mesh.position.x += (targetPos.x - this.mesh.position.x) * 0.1;
    this.mesh.position.z += (targetPos.z - this.mesh.position.z) * 0.1;
    
    // ponytail: anchor arrow height to camera height to prevent vertical drift
    const target_y = cameraPosition.y - 1.3;
    this.baseY = target_y;
  }
  
  update(delta: number) {
    this.time += delta;
    
    let diff = this.targetRotation - this.mesh.rotation.y;
    while (diff < -Math.PI) diff += Math.PI * 2;
    while (diff > Math.PI) diff -= Math.PI * 2;
    
    this.mesh.rotation.y += diff * 5 * delta;
    
    if (this.animationType === 'bounce') {
      this.mesh.position.y = this.baseY + Math.sin(this.time * 4) * 0.05;
    } else if (this.animationType === 'pulse') {
      this.mesh.position.y = this.baseY;
      const scale = 1 + Math.sin(this.time * 5) * 0.1;
      this.mesh.scale.set(scale, scale, scale);
    } else {
      this.mesh.position.y = this.baseY;
    }
  }
}
