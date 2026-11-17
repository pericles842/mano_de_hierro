import * as THREE from 'three';
import type { UnitType } from '../data/units';
import { VoxelBuilder } from './voxel';

export type CrowdModel =
  | 'pacifico0'
  | 'pacifico1'
  | 'pacifico2'
  | 'radical'
  | 'lider'
  | 'palo'
  | 'molotov'
  | 'escudero'
  | 'prensa'
  | 'medico';
/** Índices 0-4 = `Protester.model` de la simulación; 5+ = variantes por arma o tipo. */
export const CROWD_MODELS: readonly CrowdModel[] = [
  'pacifico0',
  'pacifico1',
  'pacifico2',
  'radical',
  'lider',
  'palo',
  'molotov',
  'escudero',
  'prensa',
  'medico',
];
export const MODEL_PALO = 5;
export const MODEL_MOLOTOV = 6;
export const MODEL_ESCUDERO = 7;
export const MODEL_PRENSA = 8;
export const MODEL_MEDICO = 9;
export type ModelKey = CrowdModel | UnitType | 'palace' | 'tree' | 'lamp' | 'marker' | 'motoCarry';

/** Material compartido por todos los modelos voxel (el color va en los vértices). */
export const VOXEL_MATERIAL = new THREE.MeshLambertMaterial({ vertexColors: true });

const cache = new Map<ModelKey, THREE.BufferGeometry>();
const gearCache = new Map<string, THREE.BufferGeometry>();

/** Equipo visible de los antidisturbios según las mejoras compradas. */
export interface Gear {
  visor: boolean;
  mask: boolean;
  poly: boolean;
  bat: boolean;
  /** Pistola en la mano (toda la policía, con «Mano dura»). */
  pistol: boolean;
  /** Barricadas: muro de concreto (nivel 2) y con pinchos (nivel 3). */
  concrete: boolean;
  spikes: boolean;
}

export function gearFrom(upgrades: readonly string[], lethal: boolean): Gear {
  return {
    visor: upgrades.includes('cascos'),
    mask: upgrades.includes('mascaras'),
    poly: upgrades.includes('policarbonato'),
    bat: upgrades.includes('bate'),
    pistol: lethal,
    concrete: upgrades.includes('concreto'),
    spikes: upgrades.includes('pinchos'),
  };
}

/** Modelo de una unidad teniendo en cuenta su equipo (antidisturbios, muro de escudos y barricada cambian de aspecto). */
export function getUnitModel(type: UnitType, gear: Gear): THREE.BufferGeometry {
  if (type === 'barricade') {
    if (!gear.concrete) return getModel(type);
    const key = `barricade|${gear.spikes ? 's' : ''}`;
    let geometry = gearCache.get(key);
    if (!geometry) {
      geometry = concreteBarricadeModel(gear.spikes);
      gearCache.set(key, geometry);
    }
    return geometry;
  }
  if (type !== 'soldier' && type !== 'shield') return getModel(type);
  const key = `${type}|${gear.visor ? 'v' : ''}${gear.mask ? 'm' : ''}${gear.poly ? 'p' : ''}${gear.bat ? 'b' : ''}${gear.pistol ? 'g' : ''}`;
  let geometry = gearCache.get(key);
  if (!geometry) {
    geometry = type === 'soldier' ? soldierGearModel(gear) : shieldWallGearModel(gear);
    gearCache.set(key, geometry);
  }
  return geometry;
}

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
    case 'escudero':
      return escuderoModel();
    case 'prensa':
      return prensaModel();
    case 'medico':
      return medicoModel();
    case 'gasser':
      return gasserModel();
    case 'shotgun':
      return shotgunModel();
    case 'moto':
      return motoModel(false);
    case 'motoCarry':
      return motoModel(true);
    case 'capture':
      return captureModel();
    case 'negotiator':
      return negotiatorModel();
    case 'gastruck':
      return gastruckModel();
    case 'supply':
      return supplyModel();
    case 'army':
      return armyModel();
    case 'soldier':
      return soldierModel();
    case 'shield':
      return shieldWallModel();
    case 'barricade':
      return barricadeModel();
    case 'sniper':
      return sniperModel();
    case 'colectivo':
      return colectivoModel();
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
  // Megáfono en la otra mano, a la altura de la boca: se le reconoce de lejos.
  b.box(-1, 6, 1, -1, 7, 2, 0xfacc15);
  b.box(-2, 6, 3, -1, 8, 3, 0xfde047);
  b.set(-1, 7, 4, 0xfde047).set(-2, 7, 4, 0xfde047);
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

function soldierGearModel(g: Gear): THREE.BufferGeometry {
  const b = new VoxelBuilder();
  soldierBody(b, 0);
  if (g.visor) b.box(1, 7, 2, 2, 8, 2, 0x93c5fd); // visera
  if (g.mask) {
    b.box(1, 6, 2, 2, 6, 2, 0x166534); // máscara antigás
    b.set(1, 6, 3, 0x111111).set(2, 6, 3, 0x111111);
  }
  if (g.poly) {
    b.box(-2, 1, 2, 1, 7, 2, 0xbfe3ff); // escudo grande de policarbonato
    b.box(-2, 6, 2, 1, 6, 2, 0x1e3a8a);
  } else {
    b.box(-2, 2, 2, 1, 6, 2, 0xcbd5e1); // escudo pequeño
    b.box(-2, 4, 2, 1, 4, 2, 0xfacc15);
  }
  if (g.pistol) {
    b.box(4, 4, 1, 4, 4, 4, 0x1f2937); // pistola, brazo extendido
    b.box(4, 3, 2, 4, 3, 2, 0x111111); // empuñadura
  } else if (g.bat) {
    b.box(4, 0, 1, 4, 4, 1, 0xb45309); // bate
    b.box(4, 5, 1, 4, 6, 1, 0xd97706);
  } else {
    b.box(4, 0, 1, 4, 2, 1, 0x111111); // porra
  }
  return b.build({ size: PERSON_SIZE, center: true });
}

function shieldWallGearModel(g: Gear): THREE.BufferGeometry {
  const b = new VoxelBuilder();
  for (const ox of [0, 6, 12]) soldierBody(b, ox);
  const shield = g.poly ? 0xd6ecff : 0xb6c3d1;
  b.box(-2, 1, 2, 17, g.poly ? 8 : 7, 2, shield);
  b.box(-2, 5, 2, 17, 5, 2, g.poly ? 0x1e3a8a : 0xfacc15);
  for (const x of [3, 9, 15]) b.box(x, 1, 2, x, g.poly ? 8 : 7, 2, 0x8a99ab);
  if (g.visor) for (const ox of [0, 6, 12]) b.box(ox + 1, g.poly ? 9 : 8, 2, ox + 2, g.poly ? 9 : 8, 2, 0x93c5fd);
  if (g.pistol) for (const ox of [0, 6, 12]) b.box(ox + 3, 7, 3, ox + 3, 7, 4, 0x1f2937); // pistolas asomando
  return b.build({ size: PERSON_SIZE, center: true });
}

/** Barricada nivel 2 (concreto, misma altura) y nivel 3 (con pinchos encima). */
function concreteBarricadeModel(spikes: boolean): THREE.BufferGeometry {
  const b = new VoxelBuilder();
  b.box(0, 0, 0, 15, 1, 3, 0x6b7280); // zócalo
  for (let x = 0; x <= 15; x++) {
    for (let y = 2; y <= 6; y++) {
      const seam = x % 4 === 3 || y === 4;
      b.box(x, y, 1, x, y, 2, seam ? 0x8b9099 : 0xa8adb5);
    }
  }
  b.box(0, 3, 1, 15, 3, 1, 0xf5c518); // franja reflectante
  if (spikes) {
    for (let x = 0; x <= 15; x += 2) {
      b.set(x, 7, 1, 0x4b5563).set(x, 8, 1, 0x9ca3af); // pinchos de acero
      b.set(x + 1, 7, 2, 0x4b5563).set(x + 1, 8, 2, 0x9ca3af);
    }
  } else {
    b.set(0, 7, 1, 0xef4444).set(15, 7, 1, 0xef4444); // luces
  }
  return b.build({ size: 0.25, center: true });
}

function shieldWallModel(): THREE.BufferGeometry {
  const b = new VoxelBuilder();
  for (const ox of [0, 6, 12]) soldierBody(b, ox);
  b.box(-2, 1, 2, 17, 7, 2, 0xb6c3d1); // muro de escudos
  b.box(-2, 5, 2, 17, 5, 2, 0xfacc15);
  for (const x of [3, 9, 15]) b.box(x, 1, 2, x, 7, 2, 0x8a99ab);
  return b.build({ size: PERSON_SIZE, center: true });
}

// ─── Manifestantes especiales ────────────────────────────────────────────

function escuderoModel(): THREE.BufferGeometry {
  const b = new VoxelBuilder();
  person(b, 0, 0, { shirt: 0x4b5563, pants: 0x1f2937, skin: 0xc68642, hair: 0x111111 });
  b.box(0, 8, 0, 3, 9, 1, 0x2563eb); // casco de bici
  b.box(-2, 1, 2, 5, 7, 2, 0x8b5a2b); // escudo casero de madera
  b.box(-2, 4, 2, 5, 4, 2, 0x6b4423);
  b.box(0, 5, 2, 3, 6, 2, 0xdc2626); // pintado con un mensaje
  return b.build({ size: PERSON_SIZE, center: true });
}

function prensaModel(): THREE.BufferGeometry {
  const b = new VoxelBuilder();
  person(b, 0, 0, { shirt: 0x1d4ed8, pants: 0x374151, skin: 0xe0ac69, hair: 0x5a3a1a });
  b.box(0, 4, 1, 3, 4, 1, 0xfafafa); // PRENSA en el chaleco
  b.box(3, 7, 2, 5, 8, 3, 0x111111); // cámara al hombro
  b.set(4, 7, 4, 0x60a5fa);
  b.box(4, 4, 1, 4, 6, 1, 0x1d4ed8);
  return b.build({ size: PERSON_SIZE, center: true });
}

function medicoModel(): THREE.BufferGeometry {
  const b = new VoxelBuilder();
  person(b, 0, 0, { shirt: 0xf8fafc, pants: 0x94a3b8, skin: 0xc68642, hair: 0x111111 });
  b.box(1, 3, 1, 2, 5, 1, 0xdc2626).box(0, 4, 1, 3, 4, 1, 0xdc2626); // cruz roja
  b.box(0, 8, 0, 3, 8, 1, 0xf8fafc).set(1, 9, 1, 0xdc2626);
  b.box(4, 1, 1, 5, 2, 2, 0xdc2626); // botiquín
  return b.build({ size: PERSON_SIZE, center: true });
}

// ─── Policía especializada y ejército ────────────────────────────────────

function gasserModel(): THREE.BufferGeometry {
  const b = new VoxelBuilder();
  soldierBody(b, 0);
  b.box(1, 6, 2, 2, 7, 2, 0x166534); // máscara antigás
  b.set(1, 6, 3, 0x111111).set(2, 6, 3, 0x111111);
  b.box(4, 4, 1, 4, 4, 5, 0x374151); // lanzagranadas
  b.box(4, 3, 4, 4, 5, 5, 0x1f2937);
  b.box(-1, 2, 0, -1, 3, 0, 0x84cc16).box(4, 2, 0, 4, 3, 0, 0x84cc16); // botes en el cinturón
  return b.build({ size: PERSON_SIZE, center: true });
}

function shotgunModel(): THREE.BufferGeometry {
  const b = new VoxelBuilder();
  soldierBody(b, 0);
  b.box(1, 7, 2, 2, 8, 2, 0x93c5fd);
  b.box(3, 4, 1, 4, 4, 6, 0x1f2937); // escopeta
  b.box(3, 4, 1, 4, 4, 2, 0xf97316); // culata naranja: munición de goma
  return b.build({ size: PERSON_SIZE, center: true });
}

function captureModel(): THREE.BufferGeometry {
  const b = new VoxelBuilder();
  const black = 0x111827;
  for (const ox of [0, 6]) {
    person(b, ox, 0, { shirt: black, pants: black, skin: 0xe0ac69, hair: black });
    b.box(ox + 1, 7, 1, ox + 2, 7, 1, 0x111111); // gafas oscuras
    b.box(ox, 8, 0, ox + 3, 9, 1, black);
  }
  b.box(3, 4, 1, 6, 4, 1, 0x9ca3af); // esposas
  return b.build({ size: PERSON_SIZE, center: true });
}

function negotiatorModel(): THREE.BufferGeometry {
  const b = new VoxelBuilder();
  person(b, 0, 0, { shirt: 0xf8fafc, pants: 0x1e3a8a, skin: 0xe0ac69, hair: 0x6b7280 });
  b.box(1, 3, 1, 1, 5, 1, 0x1e3a8a); // corbata
  b.box(4, 6, 1, 4, 7, 1, 0xf8fafc); // brazo en alto
  b.box(4, 8, 1, 5, 9, 3, 0xfacc15); // megáfono
  b.set(5, 9, 4, 0xfde047);
  return b.build({ size: PERSON_SIZE, center: true });
}

function armyModel(): THREE.BufferGeometry {
  const b = new VoxelBuilder();
  const camo = 0x4d5b2e;
  for (const ox of [0, 6, 12]) {
    person(b, ox, 0, { shirt: camo, pants: 0x3f4a25, skin: 0xc68642, hair: 0x111111 });
    b.box(ox, 8, 0, ox + 3, 9, 1, 0x3f4a25); // casco
    b.box(ox + 1, 10, 0, ox + 2, 10, 1, 0x3f4a25);
    b.set(ox, 4, 1, 0x6b7c3a).set(ox + 3, 5, 0, 0x6b7c3a); // manchas de camuflaje
    b.box(ox + 4, 3, 1, ox + 4, 9, 1, 0x1f2937); // fusil al hombro, apuntando al cielo
  }
  b.box(-1, 0, -1, 16, 0, -1, 0x2d3520); // sombra de botas
  return b.build({ size: PERSON_SIZE, center: true });
}

/**
 * Moto policial con dos agentes (piloto delante, otro detrás). Con `carry`,
 * el detenido va sentado en medio, con las manos atrás.
 */
function motoModel(carry: boolean): THREE.BufferGeometry {
  const b = new VoxelBuilder();
  // Colores claros de policía: que se distingan bien desde la cámara cenital.
  const UNIFORM = 0x3b6fb6;
  const LEGS = 0x2a4f86;
  const HELMET = 0xf1f5f9;
  const VISOR = 0x93c5fd;
  b.box(1, 0, 0, 2, 2, 1, 0x1f2937).box(1, 0, 9, 2, 2, 10, 0x1f2937); // ruedas
  b.box(1, 2, 1, 2, 3, 9, 0xf8fafc); // chasis blanco
  b.box(1, 3, 1, 2, 3, 9, 0x2563eb); // franja azul
  b.box(0, 3, 7, 3, 4, 9, 0xf8fafc); // carenado
  b.set(1, 4, 10, 0xfde047).set(2, 4, 10, 0xfde047); // faro
  b.set(1, 5, 8, 0x3b82f6).set(2, 5, 8, 0xef4444); // sirena azul y roja
  const rider = (z: number): void => {
    b.box(1, 4, z, 2, 6, z + 1, UNIFORM); // torso
    b.box(0, 5, z + 1, 3, 5, z + 1, UNIFORM); // brazos
    b.box(0, 3, z, 0, 4, z + 1, LEGS).box(3, 3, z, 3, 4, z + 1, LEGS); // piernas
    b.box(1, 7, z, 2, 8, z + 1, HELMET); // casco blanco
    b.box(1, 7, z + 1, 2, 7, z + 1, VISOR); // visera
  };
  rider(5); // piloto
  rider(1); // agente de atrás
  if (carry) {
    // Detenido en medio: ropa civil naranja, cabeza descubierta, encogido.
    b.box(1, 4, 3, 2, 5, 4, 0xf59e0b);
    b.box(1, 6, 3, 2, 7, 4, 0xc68642);
    b.box(1, 7, 3, 2, 7, 3, 0x111111); // pelo
  }
  return b.build({ size: 0.22, center: true });
}

// ─── Estructuras y vehículos ─────────────────────────────────────────────

function truckBase(b: VoxelBuilder, body: number): void {
  b.box(0, 1, 0, 9, 2, 19, 0x4b5563);
  b.box(0, 3, 14, 9, 8, 19, body); // cabina
  b.box(1, 6, 19, 8, 8, 19, 0x5aa0d8);
  b.box(0, 6, 15, 0, 7, 18, 0x5aa0d8).box(9, 6, 15, 9, 7, 18, 0x5aa0d8);
  b.set(1, 4, 19, 0xfde047).set(8, 4, 19, 0xfde047);
  wheels(b, [2, 8, 15], 10);
}

function gastruckModel(): THREE.BufferGeometry {
  const b = new VoxelBuilder();
  truckBase(b, 0x3f3f46);
  b.box(0, 3, 0, 9, 7, 13, 0x52525b); // caja blindada
  b.box(2, 8, 4, 7, 9, 10, 0x27272a); // torreta lanzagás
  for (const x of [2, 4, 6]) b.box(x, 10, 7, x + 1, 10, 12, 0x84cc16); // tubos
  b.box(0, 5, 0, 0, 5, 13, 0xfacc15).box(9, 5, 0, 9, 5, 13, 0xfacc15);
  return b.build({ size: 0.25, center: true });
}

function supplyModel(): THREE.BufferGeometry {
  const b = new VoxelBuilder();
  truckBase(b, 0x4d5b2e);
  b.box(0, 3, 0, 9, 8, 13, 0x6b7c3a); // lona
  for (const z of [1, 5, 9]) b.box(-1, 3, z, -1, 5, z + 2, 0x8b5a2b).box(10, 3, z, 10, 5, z + 2, 0x8b5a2b); // cajas
  b.box(3, 9, 5, 6, 9, 8, 0xf8fafc).box(4, 9, 4, 5, 9, 9, 0xdc2626);
  return b.build({ size: 0.25, center: true });
}

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

/** Francotirador tumbado en la azotea, con fusil de precisión. */
function sniperModel(): THREE.BufferGeometry {
  const b = new VoxelBuilder();
  const CAMO = 0x1f2937;
  b.box(0, 0, 0, 3, 1, 6, CAMO); // cuerpo tumbado
  b.box(1, 1, 6, 2, 2, 7, 0xe0ac69); // cabeza
  b.box(1, 2, 6, 2, 2, 7, 0x111111); // gorra
  b.box(2, 1, 7, 2, 1, 12, 0x111111); // cañón largo
  b.box(2, 2, 8, 2, 2, 9, 0x374151); // mira telescópica
  b.box(1, 0, 10, 1, 0, 10, 0x111111).box(3, 0, 10, 3, 0, 10, 0x111111); // bípode
  return b.build({ size: PERSON_SIZE, center: true });
}

/** Colectivo a pie: civil con gorra, pañuelo y camiseta del partido, pistola en la mano. */
function colectivoModel(): THREE.BufferGeometry {
  const b = new VoxelBuilder();
  person(b, 0, 0, { shirt: 0xb91c1c, pants: 0x27272a, skin: 0xc68642, hair: 0x111111 });
  b.box(1, 6, 0, 2, 6, 1, 0x111111); // pañuelo tapando la cara
  b.box(0, 9, 0, 3, 9, 1, 0x1f2937).box(1, 9, 2, 2, 9, 2, 0x1f2937); // gorra con visera
  b.box(4, 4, 1, 4, 4, 3, 0x111111); // pistola apuntando
  return b.build({ size: PERSON_SIZE, center: true });
}
