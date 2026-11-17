import * as THREE from 'three';

const DROPS = 900;
const AREA = { minX: -45, maxX: 45, minZ: -38, maxZ: 48, top: 26 };
const FALL_SPEED = 24;
const LENGTH = 0.7;

/**
 * Lluvia sutil: rayitas finas y muy transparentes que caen sobre la plaza.
 * Se ve que llueve, pero no tapa lo que pasa.
 */
export class RainFx {
  readonly mesh: THREE.LineSegments;
  private readonly positions = new Float32Array(DROPS * 6);
  private readonly geometry = new THREE.BufferGeometry();
  private readonly material = new THREE.LineBasicMaterial({ color: 0xc7dcf5, transparent: true, opacity: 0.16, depthWrite: false });

  constructor(private readonly wind: { x: number; z: number }) {
    for (let i = 0; i < DROPS; i++) this.reset(i, Math.random() * AREA.top);
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.mesh = new THREE.LineSegments(this.geometry, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 6;
  }

  /** Coloca la gota `i` a la altura `y`, en un punto al azar de la plaza. */
  private reset(i: number, y: number): void {
    const x = AREA.minX + Math.random() * (AREA.maxX - AREA.minX);
    const z = AREA.minZ + Math.random() * (AREA.maxZ - AREA.minZ);
    this.positions.set([x, y, z, x - this.wind.x * 0.04, y + LENGTH, z - this.wind.z * 0.04], i * 6);
  }

  update(dt: number): void {
    const p = this.positions;
    const dx = this.wind.x * 0.06 * dt;
    const dz = this.wind.z * 0.06 * dt;
    for (let i = 0; i < DROPS; i++) {
      const o = i * 6;
      p[o + 1] -= FALL_SPEED * dt;
      if (p[o + 1] <= 0) {
        this.reset(i, AREA.top);
        continue;
      }
      p[o + 4] = p[o + 1] + LENGTH;
      p[o] += dx;
      p[o + 3] += dx;
      p[o + 2] += dz;
      p[o + 5] += dz;
    }
    (this.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}
