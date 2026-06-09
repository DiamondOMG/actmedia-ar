import * as THREE from 'three';

export interface PositionCorrection {
  source: string;
  timestamp: number;
  driftBefore: number;
  correctedTo: THREE.Vector3;
}

export class PositionProvider {
  public position: THREE.Vector3;
  public quaternion: THREE.Quaternion;
  public headingOffsetRad: number;
  public scaleFactor: number; // อัตราส่วนสเกลเพื่อปรับชดเชยระยะทางจริงกับ SLAM (ค่าเริ่มต้น 1.0)
  public corrections: PositionCorrection[];
  
  private _listeners: Record<string, Function[]>;
  private _layers: Map<string, any>;

  constructor() {
    this.position = new THREE.Vector3(0, 0, 0);
    this.quaternion = new THREE.Quaternion();
    this.headingOffsetRad = 0;
    this.scaleFactor = 1.0;
    
    // โหลดค่า Scale Factor จาก localStorage ถ้าอยู่ในฝั่ง Client
    if (typeof window !== "undefined") {
      try {
        const savedScale = localStorage.getItem("ar_scale_factor");
        if (savedScale) {
          const parsed = parseFloat(savedScale);
          if (!isNaN(parsed) && parsed > 0) {
            this.scaleFactor = parsed;
            console.log(`[PositionProvider] Loaded saved scaleFactor: ${parsed}`);
          }
        }
      } catch (e) {
        console.error("[PositionProvider] Failed to load ar_scale_factor:", e);
      }
    }

    this._listeners = {
      positionUpdate: [],
      correctionApplied: [],
    };
    this.corrections = [];
    this._layers = new Map();
  }

  addLayer(name: string, layer: any) {
    this._layers.set(name, layer);
    console.log(`[PositionProvider] Layer added: ${name}`);
  }

  removeLayer(name: string) {
    const layer = this._layers.get(name);
    if (layer && layer.destroy) layer.destroy();
    this._layers.delete(name);
    console.log(`[PositionProvider] Layer removed: ${name}`);
  }

  hasLayer(name: string) {
    return this._layers.has(name);
  }

  updateFromSlam(cameraPosition: THREE.Vector3, cameraQuaternion: THREE.Quaternion) {
    // ปรับ Scale ของพิกัด X และ Z เพื่อปรับระยะห่างในโลกเสมือนให้เทียบเท่าระยะจริง
    const adjustedPos = cameraPosition.clone();
    adjustedPos.x *= this.scaleFactor;
    adjustedPos.z *= this.scaleFactor;

    // Apply heading offset rotation
    if (this.headingOffsetRad !== 0) {
      const rotMatrix = new THREE.Matrix4().makeRotationY(this.headingOffsetRad);
      this.position.copy(adjustedPos).applyMatrix4(rotMatrix);
    } else {
      this.position.copy(adjustedPos);
    }

    this.quaternion.copy(cameraQuaternion);
    this._emit('positionUpdate', this.position);
  }

  applyCorrection(source: string, knownPosition: THREE.Vector3) {
    const drift = this.position.distanceTo(knownPosition);

    console.log(
      `[PositionProvider] Correction from ${source}: ` +
      `drift was ${drift.toFixed(2)}m → reset to (${knownPosition.x.toFixed(1)}, ${knownPosition.z.toFixed(1)})`
    );

    this.corrections.push({
      source,
      timestamp: Date.now(),
      driftBefore: drift,
      correctedTo: knownPosition.clone(),
    });

    this.position.copy(knownPosition);
    this._emit('correctionApplied', { source, drift, position: knownPosition });
  }

  setHeadingOffset(degrees: number) {
    this.headingOffsetRad = THREE.MathUtils.degToRad(degrees);
  }

  on(event: string, callback: Function) {
    if (this._listeners[event]) {
      this._listeners[event].push(callback);
    }
  }

  off(event: string, callback: Function) {
    if (this._listeners[event]) {
      this._listeners[event] = this._listeners[event].filter(cb => cb !== callback);
    }
  }

  private _emit(event: string, data: any) {
    if (this._listeners[event]) {
      this._listeners[event].forEach(cb => cb(data));
    }
  }

  getDebugInfo() {
    return {
      position: `(${this.position.x.toFixed(2)}, ${this.position.z.toFixed(2)})`,
      layers: Array.from(this._layers.keys()),
      totalCorrections: this.corrections.length,
      lastCorrection: this.corrections.length > 0
        ? this.corrections[this.corrections.length - 1]
        : null,
    };
  }
}

export const positionProvider = new PositionProvider();
