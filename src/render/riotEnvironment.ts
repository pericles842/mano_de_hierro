import * as THREE from 'three';
import { Random } from '../core/Random';
import { BLOCKS, PALACE } from '../sim/riot/map';
import { VOXEL_MATERIAL, getModel } from './models';
import { VoxelBuilder, darken } from './voxel';

const WALL_COLORS = [0xe9d8a6, 0xf4f1de, 0xc8d5b9, 0xf2cc8f, 0xe07a5f, 0x81b29a, 0xd4a5a5, 0xbcd4e6];

export interface RiotEnvironment {
  group: THREE.Group;
  dispose(): void;
}

/** Plaza de la Patria: suelo, manzanas de edificios, palacio y decoración. */
export function buildRiotEnvironment(seed: number): RiotEnvironment {
  const rng = new Random(seed);
  const group = new THREE.Group();
  const owned: THREE.BufferGeometry[] = [];

  const addMesh = (geometry: THREE.BufferGeometry, x: number, z: number, own = true): THREE.Mesh => {
    const mesh = new THREE.Mesh(geometry, VOXEL_MATERIAL);
    mesh.position.set(x, 0, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    if (own) owned.push(geometry);
    return mesh;
  };

  // Suelo: baldosas de 2 m.
  const floor = new VoxelBuilder();
  for (let i = -26; i < 26; i++) {
    for (let j = -20; j < 26; j++) floor.set(i, -1, j, floorColor(i, j));
  }
  const floorMesh = addMesh(floor.build({ size: 2, jitter: 0.03 }), 0, 0);
  floorMesh.castShadow = false;

  // Manzanas: rellenas de edificios. Se recortan para no tapar la vista lejana.
  for (const b of BLOCKS) {
    fillBlock(Math.max(b.minX, -50), Math.min(b.maxX, 50), Math.max(b.minZ, -36), Math.min(b.maxZ, 48));
  }
  fillBlock(-30, -10, -36, -23);
  fillBlock(10, 30, -36, -23);
  fillBlock(-9, 9, -38, -31);

  function fillBlock(minX: number, maxX: number, minZ: number, maxZ: number): void {
    for (let x = minX + 0.5; x < maxX - 4; ) {
      const w = Math.min(rng.int(6, 10), Math.floor(maxX - x - 0.5));
      for (let z = minZ + 0.5; z < maxZ - 4; ) {
        const d = Math.min(rng.int(6, 10), Math.floor(maxZ - z - 0.5));
        addMesh(buildingGeometry(w, d, rng.int(5, 14), rng), x, z);
        z += d + 1;
      }
      x += w + 1;
    }
  }

  // Palacio presidencial: su fachada queda en z = PALACE.frontZ.
  addMesh(getModel('palace'), 0, PALACE.frontZ - 4, false);

  for (const [x, z] of [[-26, 26], [26, 26], [-26, -18], [26, -18], [-26, 4], [26, 12]] as const) {
    addMesh(getModel('tree'), x, z, false);
  }
  for (const x of [-13, 13, -22, 22]) addMesh(getModel('lamp'), x, PALACE.frontZ + 1.5, false);

  return {
    group,
    dispose: () => owned.forEach((g) => g.dispose()),
  };
}

function floorColor(i: number, j: number): number {
  const cx = i * 2 + 1;
  const cz = j * 2 + 1;
  const inPlaza = Math.abs(cx) <= 30 && cz >= -22 && cz <= 30;
  if (inPlaza) {
    const r = Math.hypot(cx, cz - 4);
    if (r < 3) return 0xd4a537;
    if (r < 6) return 0xa83232;
    if (Math.abs(cx) > 28 || cz > 28) return 0xb5a58c;
    return (i + j) & 1 ? 0xd6cbb8 : 0xc9bda8;
  }
  const avenue = cz > 30 && Math.abs(cx) <= 15;
  const sideStreet = Math.abs(cx) > 30 && Math.abs(cz) <= 4;
  if (avenue) return i === 0 && j % 3 === 0 ? 0xe5c100 : 0x45464d;
  if (sideStreet) return 0x45464d;
  return 0x9e978d;
}

function buildingGeometry(w: number, d: number, h: number, rng: Random): THREE.BufferGeometry {
  const b = new VoxelBuilder();
  const wall = rng.pick(WALL_COLORS);
  b.box(0, 0, 0, w - 1, h - 1, d - 1, wall);
  for (let y = 1; y < h - 1; y++) {
    if (y % 3 === 0) continue;
    const win = (): number => (rng.chance(0.12) ? 0xf6d365 : 0x34495e);
    for (let x = 1; x < w - 1; x += 2) b.set(x, y, 0, win()).set(x, y, d - 1, win());
    for (let z = 1; z < d - 1; z += 2) b.set(0, y, z, win()).set(w - 1, y, z, win());
  }
  const trim = darken(wall, 0.75);
  for (let x = 0; x < w; x++) b.set(x, h, 0, trim).set(x, h, d - 1, trim);
  for (let z = 0; z < d; z++) b.set(0, h, z, trim).set(w - 1, h, z, trim);
  if (rng.chance(0.5)) b.box(2, h, 2, 3, h + 1, 3, 0x9ca3af); // tanque de agua / aire acondicionado
  return b.build({ size: 1, jitter: 0.05 });
}
