import type { CrowdStage } from '../../data/crowdStages';
import type { SpawnId } from '../../data/riots';
import type { UnitType } from '../../data/units';

export type ProtesterKind = 'pacifico' | 'radical' | 'lider';
export type ProtesterState = 'gathering' | 'advancing' | 'occupying' | 'fleeing' | 'gone';
export type Weapon = 'none' | 'piedra' | 'palo' | 'molotov';

export interface Protester {
  id: number;
  kind: ProtesterKind;
  /** Modelo base (0-2 pacíficos, 3 radical, 4 líder). El render lo cambia si va armado. */
  model: number;
  weapon: Weapon;
  x: number;
  z: number;
  /** Posición del paso anterior, para interpolar en el render. */
  px: number;
  pz: number;
  vx: number;
  vz: number;
  /** Punto de concentración antes de que arranque la marcha. */
  homeX: number;
  homeZ: number;
  speed: number;
  resolve: number;
  maxResolve: number;
  state: ProtesterState;
  targetX: number;
  fleeTo: SpawnId;
  throwCd: number;
}

export interface Unit {
  id: number;
  type: UnitType;
  x: number;
  z: number;
  px: number;
  pz: number;
  heading: number;
  targetX: number;
  targetZ: number;
  integrity: number;
  maxIntegrity: number;
  water: number;
  sprayTarget: { x: number; z: number } | null;
}

export interface FireZone {
  kind: 'molotov' | 'tire';
  x: number;
  z: number;
  r: number;
  life: number;
}

export type RiotEvent =
  | { type: 'throw'; fromX: number; fromZ: number; toX: number; toZ: number }
  | { type: 'molotov'; fromX: number; fromZ: number; toX: number; toZ: number }
  | { type: 'tire'; x: number; z: number }
  | { type: 'spray'; fromX: number; fromZ: number; toX: number; toZ: number }
  | { type: 'impact'; x: number; z: number; level: number }
  | { type: 'disperse'; x: number; z: number }
  | { type: 'unitBroken'; unitType: UnitType; x: number; z: number }
  | { type: 'escalate'; stage: CrowdStage; up: boolean }
  | { type: 'wave'; spawn: SpawnId; count: number }
  | { type: 'marchStart' };

export interface RiotResult {
  won: boolean;
  reason: 'time' | 'cleared' | 'palace';
  total: number;
  dispersed: number;
  elapsed: number;
  /** Nivel de fuerza medio usado (0..3), ponderado por tiempo. */
  avgForce: number;
  tanquetas: number;
  brokenUnits: number;
  palaceHp: number;
  peakStage: CrowdStage;
  finalAnger: number;
}
