import * as THREE from 'three';
import type { UnitType } from '../data/units';
import { VoxelBuilder } from './voxel';

export type CrowdModel = 'pacifico0' | 'pacifico1' | 'pacifico2' | 'radical' | 'lider' | 'palo' | 'molotov';
/** Índices 0-4 = `Protester.model` de la simulación; 5-6 = variantes armadas. */
export const CROWD_MODELS: readonly CrowdModel[] = [
  'pacifico0',
  'pacifico1',
  'pacifico2',
  'radical',
  'lider',
  'palo',
  'molotov',
];
export const MODEL_PALO = 5;
export const MODEL_MOLOTOV = 6;
export type ModelKey = CrowdModel | UnitType | 'palace' | 'tree' | 'lamp' | 'marker';

/** Material compartido por todos los modelos voxel (el color va en los vértices). */
export const VOXEL_MATERIAL = new THREE.MeshLambertMaterial({ vertexColors: true });

const cache = new Map<ModelKey, THREE.BufferGeometry>();

/** Geometrías cacheadas y compartidas: NO se deben liberar con dispose() al cambiar de escena. */
export function getModel(key: ModelKey): THREE.BufferGeometry {
  let geometry = cache.get(key);
  if (!geometry) {
    geometry = buildModel(key);
    cache.set(key, geometry);
  }
  return geometry;
}

function buildModel(key: ModelKey): THREE.BufferGeometry {
  switch (key) {
    case 'pacifico0':
      return personModel({ shirt: 0x3b82f6, pants: 0x334155, skin: 0xc68642, hair: 0x2b1b10 });
    case 'pacifico1':
      return personModel({ shirt: 0x22c55e, pants: 0x1e3a8a, skin: 0xe0ac69, hair: 0x111111 });
    case 'pacifico2':
      return personModel({ shirt: 0xf97316, pants: 0x3f3f46, skin: 0x8d5524, hair: 0x3b2414 });
    case 'radical':
      return radicalModel();
    case 'lider':
      return leaderModel();
    case 'palo':
      return stickModel();
    case 'molotov':
      return molotovModel();
    case 'soldier':
      return soldierModel();
    case 'shield':
      return shieldWallModel();
    case 'barricade':
      return barricadeModel();
    case 'ballena':
      return ballenaModel();
    case 'tanqueta':
      return tanquetaModel();
    case 'palace':
      return palaceModel();
    case 'tree':
      return treeModel();
    case 'lamp':
      return lampModel();
    case 'marker':
      return markerModel();
  }
}

// ─── Personas ────────────────────────────────────────────────────────────
// Personaje de 6×10×2 voxels mirando a +Z (el frente).

interface PersonStyle {
  shirt: number;
  pants: number;
  skin: number;
  hair: number;
}

function person(b: VoxelBuilder, ox: number, oz: number, s: PersonStyle): void {
  const shoes = 0x1f1f1f;
  b.box(ox, 0, oz, ox + 1, 0, oz + 1, shoes).box(ox + 2, 0, oz, ox + 3, 0, oz + 1, shoes);
  b.box(ox, 1, oz, ox + 1, 2, oz + 1, s.pants).box(ox + 2, 1, oz, ox + 3, 2, oz + 1, s.pants);
  b.box(ox, 3, oz, ox + 3, 5, oz + 1, s.shirt);
  b.box(ox - 1, 4, oz, ox - 1, 5, oz + 1, s.shirt).box(ox + 4, 4, oz, ox + 4, 5, oz + 1, s.shirt);
  b.box(ox - 1, 3, oz, ox - 1, 3, oz + 1, s.skin).box(ox + 4, 3, oz, ox + 4, 3, oz + 1, s.skin);
  b.box(ox + 1, 6, oz, ox + 2, 8, oz + 1, s.skin);
  b.box(ox + 1, 9, oz, ox + 2, 9, oz + 1, s.hair).box(ox + 1, 7, oz, ox + 2, 8, oz, s.hair);
  b.set(ox + 1, 7, oz + 1, 0x222222).set(ox + 2, 7, oz + 1, 0x222222);
}

const PERSON_SIZE = 0.18;

function personModel(style: PersonStyle): THREE.BufferGeometry {
  const b = new VoxelBuilder();
  person(b, 0, 0, style);
  return b.build({ size: PERSON_SIZE, center: true });
}

function radicalModel(): THREE.BufferGeometry {
  const b = new VoxelBuilder();
  const hood = 0x262626;
  person(b, 0, 0, { shirt: hood, pants: 0x1c1c1c, skin: 0xc68642, hair: hood });
  b.box(1, 6, 1, 2, 6, 1, 0xdc2626); // pañuelo rojo
  b.box(0, 6, 0, 0, 9, 1, hood).box(3, 6, 0, 3, 9, 1, hood); // capucha
  b.set(4, 2, 1, 0x9ca3af); // piedra en la mano
  return b.build({ size: PERSON_SIZE, center: true });
}

function leaderModel(): THREE.BufferGeometry {
  const b = new VoxelBuilder();
  person(b, 0, 0, { shirt: 0xfacc15, pants: 0x1e293b, skin: 0xe0ac69, hair: 0x5a3a1a });
  b.box(5, 3, 1, 5, 12, 1, 0x8b5a2b); // palo
  b.box(2, 10, 1, 8, 13, 1, 0xfafafa); // pancarta
  b.box(3, 12, 1, 7, 12, 1, 0xdc2626).box(3, 11, 1, 6, 11, 1, 0xdc2626);
  return b.build({ size: PERSON_SIZE, center: true });
}

function stickModel(): THREE.BufferGeometry {
  const b = new VoxelBuilder();
  person(b, 0, 0, { shirt: 0xb91c1c, pants: 0x27272a, skin: 0xc68642, hair: 0x111111 });
  b.box(1, 6, 1, 2, 6, 1, 0x111111); // pañuelo negro
  b.box(5, 3, 1, 5, 11, 1, 0x8b5a2b); // palo
  b.box(5, 3, 1, 5, 3, 1, 0xc68642);
  return b.build({ size: PERSON_SIZE, center: true });
}

function molotovModel(): THREE.BufferGeometry {
  const b = new VoxelBuilder();
  const hood = 0x1f3d2b;
  person(b, 0, 0, { shirt: hood, pants: 0x1c1c1c, skin: 0xe0ac69, hair: hood });
  b.box(1, 6, 1, 2, 6, 1, 0x111111);
  b.box(0, 6, 0, 0, 9, 1, hood).box(3, 6, 0, 3, 9, 1, hood);
  b.box(4, 6, 1, 4, 8, 1, hood); // brazo en alto
  b.box(4, 9, 1, 4, 10, 1, 0x16a34a); // botella
  b.set(4, 11, 1, 0xff7a00).set(4, 12, 1, 0xffd000); // mecha encendida
  return b.build({ size: PERSON_SIZE, center: true });
}

function soldierBody(b: VoxelBuilder, ox: number): void {
  person(b, ox, 0, { shirt: 0x1e3a5f, pants: 0x172a45, skin: 0xe0ac69, hair: 0x111827 });
  b.box(ox, 8, 0, ox + 3, 9, 1, 0x0f172a); // casco
  b.box(ox + 1, 10, 0, ox + 2, 10, 1, 0x0f172a);
}

function soldierModel(): THREE.BufferGeometry {
  const b = new VoxelBuilder();
  soldierBody(b, 0);
  b.box(1, 7, 2, 2, 8, 2, 0x93c5fd); // visera
  b.box(-2, 2, 2, 1, 6, 2, 0xcbd5e1); // escudo
  b.box(-2, 4, 2, 1, 4, 2, 0xfacc15);
  b.box(4, 0, 1, 4, 2, 1, 0x111111); // porra
  return b.build({ size: PERSON_SIZE, center: true });
}

function shieldWallModel(): THREE.BufferGeometry {
  const b = new VoxelBuilder();
  for (const ox of [0, 6, 12]) soldierBody(b, ox);
  b.box(-2, 1, 2, 17, 7, 2, 0xb6c3d1); // muro de escudos
  b.box(-2, 5, 2, 17, 5, 2, 0xfacc15);
  for (const x of [3, 9, 15]) b.box(x, 1, 2, x, 7, 2, 0x8a99ab);
  return b.build({ size: PERSON_SIZE, center: true });
}

// ─── Estructuras y vehículos ─────────────────────────────────────────────

function barricadeModel(): THREE.BufferGeometry {
  const b = new VoxelBuilder();
  b.box(0, 0, 0, 15, 1, 3, 0x9a9a9a);
  for (let x = 0; x <= 15; x++) {
    for (let y = 2; y <= 6; y++) {
      const stripe = Math.floor((x + y) / 2) % 2 === 0;
      b.box(x, y, 1, x, y, 2, stripe ? 0xf5c518 : 0x1a1a1a);
    }
  }
  b.set(0, 7, 1, 0xef4444).set(15, 7, 1, 0xef4444); // luces
  return b.build({ size: 0.25, center: true });
}

function wheels(b: VoxelBuilder, zs: readonly number[], width: number): void {
  for (const z of zs) {
    b.box(-1, 0, z, -1, 2, z + 2, 0x111111).box(width, 0, z, width, 2, z + 2, 0x111111);
    b.set(-1, 1, z + 1, 0x6b7280).set(width, 1, z + 1, 0x6b7280);
  }
}

function ballenaModel(): THREE.BufferGeometry {
  const b = new VoxelBuilder();
  const WHITE = 0xe8ecef;
  b.box(0, 1, 0, 9, 2, 19, 0x4b5563); // chasis
  b.box(0, 3, 0, 9, 9, 13, WHITE); // tanque
  b.box(0, 3, 14, 9, 8, 19, WHITE); // cabina
  b.box(1, 6, 19, 8, 8, 19, 0x5aa0d8); // parabrisas
  b.box(0, 6, 15, 0, 7, 18, 0x5aa0d8).box(9, 6, 15, 9, 7, 18, 0x5aa0d8);
  b.box(0, 5, 0, 0, 5, 13, 0x1e5aa8).box(9, 5, 0, 9, 5, 13, 0x1e5aa8); // franja azul
  b.set(1, 4, 19, 0xfde047).set(8, 4, 19, 0xfde047);
  b.box(3, 10, 8, 6, 11, 12, 0x6b7280); // torreta
  b.box(4, 11, 13, 5, 11, 18, 0x374151); // cañón de agua
  b.box(1, 9, 15, 2, 9, 16, 0xef4444).box(7, 9, 15, 8, 9, 16, 0x3b82f6); // sirenas
  wheels(b, [2, 8, 15], 10);
  return b.build({ size: 0.25, center: true });
}

function tanquetaModel(): THREE.BufferGeometry {
  const b = new VoxelBuilder();
  const OLIVE = 0x5b6b3a;
  const DARK = 0x3f4a28;
  for (let z = 0; z <= 17; z++) {
    const top = z >= 15 ? 6 - (z - 14) : 6;
    b.box(0, 2, z, 9, top, z, OLIVE);
  }
  b.box(2, 4, 17, 7, 4, 17, 0x1f2937); // mirilla
  b.box(2, 7, 5, 7, 9, 11, DARK); // torreta
  b.box(4, 8, 12, 5, 8, 20, 0x2d3520); // cañón
  b.box(8, 7, 3, 8, 13, 3, 0x111111); // antena
  b.box(0, 3, 0, 0, 3, 14, DARK).box(9, 3, 0, 9, 3, 14, DARK);
  wheels(b, [1, 6, 11], 10);
  return b.build({ size: 0.25, center: true });
}

function palaceModel(): THREE.BufferGeometry {
  const b = new VoxelBuilder();
  const PINK = 0xf2a7bb;
  const WHITE = 0xf8f1e4;
  const WIN = 0x2c3e66;
  const GOLD = 0xe0b13a;
  b.box(0, 0, 0, 35, 1, 15, WHITE); // zócalo y escalinata
  b.box(1, 2, 0, 34, 13, 11, PINK);
  for (const y of [4, 5, 9, 10]) {
    for (let x = 2; x <= 33; x++) {
      if ((x % 4 === 2 || x % 4 === 3) && (x < 14 || x > 21)) b.set(x, y, 11, WIN);
    }
  }
  b.box(16, 2, 11, 19, 6, 11, 0x6b3e1f); // puerta
  for (const x of [2, 7, 12, 22, 27, 32]) b.box(x, 2, 13, x + 1, 12, 14, WHITE); // columnas
  b.box(1, 13, 12, 34, 13, 15, WHITE);
  b.box(14, 8, 12, 21, 8, 14, WHITE).box(14, 9, 14, 21, 9, 14, WHITE); // balcón
  // Retrato gigante del Generalísimo
  b.box(14, 9, 11, 21, 12, 11, 0xb91c1c);
  b.box(16, 9, 11, 19, 11, 11, 0xe0ac69);
  b.box(15, 12, 11, 20, 12, 11, 0x14532d);
  b.box(15, 10, 11, 20, 10, 11, 0x1a1a1a);
  b.box(0, 14, 0, 35, 14, 12, WHITE); // cornisa
  for (let dx = -5; dx <= 5; dx++)
    for (let dy = 0; dy <= 5; dy++)
      for (let dz = -5; dz <= 5; dz++) if (dx * dx + dy * dy + dz * dz <= 26) b.set(17 + dx, 15 + dy, 6 + dz, GOLD);
  b.box(17, 21, 6, 17, 29, 6, 0x9ca3af); // asta
  b.box(18, 28, 6, 24, 28, 6, 0x6c2bd9).box(18, 27, 6, 24, 27, 6, 0xf5c518).box(18, 26, 6, 24, 26, 6, 0x6c2bd9);
  b.box(20, 27, 6, 22, 27, 6, 0x1a1a1a); // el bigote nacional
  return b.build({ size: 0.5, center: true });
}

function treeModel(): THREE.BufferGeometry {
  const b = new VoxelBuilder();
  b.box(0, 0, 0, 1, 7, 1, 0x7c4a21);
  for (let dx = -4; dx <= 5; dx++)
    for (let dy = -3; dy <= 4; dy++)
      for (let dz = -4; dz <= 5; dz++) {
        const d = (dx - 0.5) ** 2 + dy * dy * 1.3 + (dz - 0.5) ** 2;
        if (d <= 16) b.set(dx, 10 + dy, dz, (dx + dy + dz) % 3 === 0 ? 0x3f8f3a : 0x4fa346);
      }
  return b.build({ size: 0.25, center: true, jitter: 0.1 });
}

function lampModel(): THREE.BufferGeometry {
  const b = new VoxelBuilder();
  b.box(0, 0, 0, 0, 14, 0, 0x374151);
  b.box(-1, 15, -1, 1, 15, 1, 0x1f2937);
  b.box(-1, 14, -1, 1, 14, 1, 0xfff3b0);
  return b.build({ size: 0.2, center: true });
}

function markerModel(): THREE.BufferGeometry {
  const b = new VoxelBuilder();
  b.box(-1, 0, -1, 1, 1, 1, 0xdc2626);
  b.box(-1, 2, 0, 1, 2, 0, 0xf97316).box(0, 2, -1, 0, 2, 1, 0xf97316);
  b.box(0, 3, 0, 0, 3, 0, 0xfacc15).box(0, 4, 0, 0, 4, 0, 0xfde68a);
  return b.build({ size: 0.4, center: true, jitter: 0 });
}
