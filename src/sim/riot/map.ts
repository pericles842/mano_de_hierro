import type { SpawnId } from '../../data/riots';

/**
 * Geometría de la Plaza de la Patria (compartida por simulación y render).
 * Ejes: X este-oeste, Z norte-sur. El palacio está al norte (Z negativo),
 * la multitud entra por el sur (avenida) y por las calles laterales.
 */
export const PALACE = { halfWidth: 9, frontZ: -22 } as const;
export const GOAL_Z = -21;
export const PROTESTER_RADIUS = 0.35;

export interface Rect {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/** Manzanas de edificios: nadie puede atravesarlas. */
export const BLOCKS: readonly Rect[] = [
  { minX: -60, maxX: -30, minZ: 4, maxZ: 30 },
  { minX: -60, maxX: -30, minZ: -40, maxZ: -4 },
  { minX: 30, maxX: 60, minZ: 4, maxZ: 30 },
  { minX: 30, maxX: 60, minZ: -40, maxZ: -4 },
  { minX: -60, maxX: -15.5, minZ: 30, maxZ: 60 },
  { minX: 15.5, maxX: 60, minZ: 30, maxZ: 60 },
];

export interface SpawnArea {
  x: readonly [number, number];
  z: readonly [number, number];
}

export const SPAWNS: Record<SpawnId, SpawnArea> = {
  sur: { x: [-12, 12], z: [34, 40] },
  este: { x: [34, 38], z: [-3, 3] },
  oeste: { x: [-38, -34], z: [-3, 3] },
};

/** Punto de huida hacia la salida indicada. */
export function exitPoint(exit: SpawnId, x: number, z: number): { x: number; z: number } {
  switch (exit) {
    case 'sur':
      return { x: clamp(x, -12, 12), z: 48 };
    case 'este':
      return { x: 48, z: clamp(z, -3, 3) };
    case 'oeste':
      return { x: -48, z: clamp(z, -3, 3) };
  }
}

export function nearestExit(x: number, z: number): SpawnId {
  const dSur = 30 - z + Math.max(0, Math.abs(x) - 12);
  const dEste = 30 - x + Math.max(0, Math.abs(z) - 3);
  const dOeste = 30 + x + Math.max(0, Math.abs(z) - 3);
  if (dSur <= dEste && dSur <= dOeste) return 'sur';
  return dEste <= dOeste ? 'este' : 'oeste';
}

export function isOutside(x: number, z: number): boolean {
  return Math.abs(x) > 44 || z > 44;
}

/** Zona donde el jugador puede desplegar unidades: la plaza y la boca de cada calle (para trancarlas). */
export function isDeployable(x: number, z: number): boolean {
  const plaza = x >= -29 && x <= 29 && z >= -20 && z <= 29;
  const avenueMouth = Math.abs(x) <= 15 && z > 29 && z <= 33;
  const sideStreetMouth = Math.abs(x) <= 33 && Math.abs(z) <= 3.6;
  return plaza || avenueMouth || sideStreetMouth;
}

/** Empuja un punto fuera de los edificios y de la fachada del palacio. */
export function constrain(p: { x: number; z: number }): void {
  if (p.z < GOAL_Z - 0.6) p.z = GOAL_Z - 0.6;
  for (const b of BLOCKS) {
    if (p.x > b.minX && p.x < b.maxX && p.z > b.minZ && p.z < b.maxZ) {
      const left = p.x - b.minX;
      const right = b.maxX - p.x;
      const top = p.z - b.minZ;
      const bottom = b.maxZ - p.z;
      const m = Math.min(left, right, top, bottom);
      if (m === left) p.x = b.minX;
      else if (m === right) p.x = b.maxX;
      else if (m === top) p.z = b.minZ;
      else p.z = b.maxZ;
    }
  }
  p.x = clamp(p.x, -50, 50);
  p.z = Math.min(p.z, 50);
}

export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

/** Azotea del palacio: donde se apostan los francotiradores (sobre la cornisa, sin la cúpula). */
export const PALACE_ROOF = { minX: -8.5, maxX: 8.5, minZ: -29.5, maxZ: -22.6, y: 7.5, domeX: 0, domeZ: -27, domeR: 2.8 } as const;

export function isOnPalaceRoof(x: number, z: number): boolean {
  const r = PALACE_ROOF;
  const inside = x >= r.minX && x <= r.maxX && z >= r.minZ && z <= r.maxZ;
  return inside && Math.hypot(x - r.domeX, z - r.domeZ) > r.domeR;
}
