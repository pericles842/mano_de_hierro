import * as THREE from 'three';

type Vec3 = readonly [number, number, number];

/** Caras de un cubo unidad: normal, 4 esquinas en orden antihorario y sombreado para el look voxel. */
const FACES: readonly { n: Vec3; corners: readonly Vec3[]; shade: number }[] = [
  { n: [1, 0, 0], corners: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]], shade: 0.88 },
  { n: [-1, 0, 0], corners: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]], shade: 0.88 },
  { n: [0, 1, 0], corners: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]], shade: 1 },
  { n: [0, -1, 0], corners: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]], shade: 0.6 },
  { n: [0, 0, 1], corners: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]], shade: 0.94 },
  { n: [0, 0, -1], corners: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]], shade: 0.8 },
];

export interface VoxelBuildOptions {
  /** Tamaño de cada voxel en metros. */
  size?: number;
  /** Centra el modelo en X/Z y apoya la base en y=0. */
  center?: boolean;
  /** Variación aleatoria de brillo por voxel (textura sutil). */
  jitter?: number;
}

/**
 * Construye modelos voxel en código. Solo genera las caras visibles
 * (las que no tocan otro voxel), así los modelos son ligeros.
 */
export class VoxelBuilder {
  private readonly voxels = new Map<string, [number, number, number, number]>();

  set(x: number, y: number, z: number, color: number): this {
    this.voxels.set(key(x, y, z), [x, y, z, color]);
    return this;
  }

  has(x: number, y: number, z: number): boolean {
    return this.voxels.has(key(x, y, z));
  }

  /** Rellena una caja (coordenadas inclusivas). */
  box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, color: number): this {
    const [ax, bx] = x0 <= x1 ? [x0, x1] : [x1, x0];
    const [ay, by] = y0 <= y1 ? [y0, y1] : [y1, y0];
    const [az, bz] = z0 <= z1 ? [z0, z1] : [z1, z0];
    for (let x = ax; x <= bx; x++)
      for (let y = ay; y <= by; y++) for (let z = az; z <= bz; z++) this.set(x, y, z, color);
    return this;
  }

  get count(): number {
    return this.voxels.size;
  }

  build(options: VoxelBuildOptions = {}): THREE.BufferGeometry {
    const size = options.size ?? 1;
    const jitter = options.jitter ?? 0.04;
    const entries = [...this.voxels.values()];

    let ox = 0;
    let oy = 0;
    let oz = 0;
    if (options.center && entries.length > 0) {
      let minX = Infinity, maxX = -Infinity, minY = Infinity, minZ = Infinity, maxZ = -Infinity;
      for (const [x, y, z] of entries) {
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        minZ = Math.min(minZ, z);
        maxZ = Math.max(maxZ, z);
      }
      ox = (minX + maxX + 1) / 2;
      oy = minY;
      oz = (minZ + maxZ + 1) / 2;
    }

    const positions: number[] = [];
    const normals: number[] = [];
    const colors: number[] = [];
    const indices: number[] = [];
    const color = new THREE.Color();

    for (const [x, y, z, hex] of entries) {
      color.setHex(hex);
      const j = 1 + (hash3(x, y, z) - 0.5) * 2 * jitter;
      for (const face of FACES) {
        if (this.voxels.has(key(x + face.n[0], y + face.n[1], z + face.n[2]))) continue;
        const base = positions.length / 3;
        const k = face.shade * j;
        for (const c of face.corners) {
          positions.push((x + c[0] - ox) * size, (y + c[1] - oy) * size, (z + c[2] - oz) * size);
          normals.push(face.n[0], face.n[1], face.n[2]);
          colors.push(color.r * k, color.g * k, color.b * k);
        }
        indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.setIndex(indices);
    geometry.computeBoundingSphere();
    geometry.computeBoundingBox();
    return geometry;
  }
}

function key(x: number, y: number, z: number): string {
  return `${x},${y},${z}`;
}

function hash3(x: number, y: number, z: number): number {
  let h = Math.imul(x, 73856093) ^ Math.imul(y, 19349663) ^ Math.imul(z, 83492791);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export function darken(hex: number, factor: number): number {
  const c = new THREE.Color(hex);
  c.multiplyScalar(factor);
  return c.getHex();
}
