import * as THREE from 'three';

export interface ParticleSpawn {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  size: number;
  sizeEnd?: number;
  color: number;
  gravity?: number;
  drag?: number;
}

const STRIDE = 12; // x y z vx vy vz life maxLife size sizeEnd gravity drag
const GRAVITY = 9.8;

/** Partículas en forma de cubitos (agua, gas, piedras, humo) dibujadas en una sola InstancedMesh. */
export class VoxelParticles {
  readonly mesh: THREE.InstancedMesh;
  private readonly data: Float32Array;
  private readonly colors: THREE.Color[];
  private readonly matrix = new THREE.Matrix4();
  private count = 0;

  /** `opacity` < 1: partículas translúcidas (la nube de gas deja ver lo que pasa dentro). */
  constructor(private readonly capacity = 2500, opacity = 1) {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshLambertMaterial(
      opacity < 1 ? { color: 0xffffff, transparent: true, opacity, depthWrite: false } : { color: 0xffffff },
    );
    this.mesh = new THREE.InstancedMesh(geometry, material, capacity);
    this.mesh.frustumCulled = false;
    this.mesh.setColorAt(0, new THREE.Color(0xffffff));
    this.mesh.count = 0;
    this.data = new Float32Array(capacity * STRIDE);
    this.colors = Array.from({ length: capacity }, () => new THREE.Color());
  }

  spawn(p: ParticleSpawn): void {
    if (this.count >= this.capacity) return;
    const o = this.count * STRIDE;
    const d = this.data;
    d[o] = p.x;
    d[o + 1] = p.y;
    d[o + 2] = p.z;
    d[o + 3] = p.vx;
    d[o + 4] = p.vy;
    d[o + 5] = p.vz;
    d[o + 6] = p.life;
    d[o + 7] = p.life;
    d[o + 8] = p.size;
    d[o + 9] = p.sizeEnd ?? p.size * 0.3;
    d[o + 10] = p.gravity ?? 0;
    d[o + 11] = p.drag ?? 0;
    this.colors[this.count].setHex(p.color);
    this.count++;
  }

  /** Lanza una partícula en parábola que cae exactamente en el destino. */
  ballistic(
    fx: number, fy: number, fz: number,
    tx: number, ty: number, tz: number,
    speed: number, color: number, size: number,
  ): void {
    const dx = tx - fx;
    const dy = ty - fy;
    const dz = tz - fz;
    const t = Math.max(0.15, Math.hypot(dx, dz) / speed);
    this.spawn({
      x: fx, y: fy, z: fz,
      vx: dx / t,
      vy: (dy + 0.5 * GRAVITY * t * t) / t,
      vz: dz / t,
      life: t,
      size,
      sizeEnd: size,
      color,
      gravity: GRAVITY,
    });
  }

  burst(x: number, y: number, z: number, n: number, color: number, speed: number, size: number, life: number): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.4 + Math.random() * 0.6);
      this.spawn({
        x, y, z,
        vx: Math.cos(a) * s,
        vy: speed * (0.5 + Math.random()),
        vz: Math.sin(a) * s,
        life: life * (0.6 + Math.random() * 0.4),
        size,
        color,
        gravity: GRAVITY,
      });
    }
  }

  update(dt: number): void {
    const d = this.data;
    for (let i = 0; i < this.count; i++) {
      const o = i * STRIDE;
      d[o + 6] -= dt;
      if (d[o + 6] <= 0) {
        // Quita la partícula moviendo la última a su hueco.
        const last = (this.count - 1) * STRIDE;
        d.copyWithin(o, last, last + STRIDE);
        this.colors[i].copy(this.colors[this.count - 1]);
        this.count--;
        i--;
        continue;
      }
      const drag = 1 - d[o + 11] * dt;
      d[o + 4] -= d[o + 10] * dt;
      d[o + 3] *= drag;
      d[o + 4] *= drag;
      d[o + 5] *= drag;
      d[o] += d[o + 3] * dt;
      d[o + 1] += d[o + 4] * dt;
      d[o + 2] += d[o + 5] * dt;
      if (d[o + 1] < 0.05) {
        d[o + 1] = 0.05;
        d[o + 4] = 0;
      }
    }

    for (let i = 0; i < this.count; i++) {
      const o = i * STRIDE;
      const t = 1 - d[o + 6] / d[o + 7];
      const s = d[o + 8] + (d[o + 9] - d[o + 8]) * t;
      this.matrix.makeScale(s, s, s).setPosition(d[o], d[o + 1], d[o + 2]);
      this.mesh.setMatrixAt(i, this.matrix);
      this.mesh.setColorAt(i, this.colors[i]);
    }
    this.mesh.count = this.count;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.mesh.dispose();
  }
}
