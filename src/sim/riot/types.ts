import type { CrowdStage } from '../../data/crowdStages';
import type { SpawnId } from '../../data/riots';
import type { UnitType } from '../../data/units';

export type ProtesterKind = 'pacifico' | 'radical' | 'lider' | 'escudero' | 'prensa' | 'medico';
export type ProtesterState = 'gathering' | 'advancing' | 'occupying' | 'fleeing' | 'gone';
export type Weapon = 'none' | 'piedra' | 'palo' | 'molotov';

export interface Protester {
  id: number;
  kind: ProtesterKind;
  /** Modelo base (0-2 pacíficos, 3 radical, 4 líder). El render lo cambia según tipo y arma. */
  model: number;
  weapon: Weapon;
  /** Máscara casera: el gas le afecta menos. */
  masked: boolean;
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
  /** Enfriamiento de su acción (lanzar, rescatar, denunciar). */
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
  ammo: number;
  maxAmmo: number;
  /** Segundos hasta poder volver a usar su habilidad. */
  cooldown: number;
  /** Moral de la infantería (0..1). Bajo 0,25 se retira. */
  morale: number;
  retreating: boolean;
  /** Segundos desde el último golpe recibido. */
  sinceHit: number;
  /** Ejército: segundos que pasará negándose a actuar. */
  refusing: number;
  /** Equipo de captura: líder perseguido y punto al que vuelve. */
  chaseId: number | null;
  homeX: number;
  homeZ: number;
  sprayTarget: { x: number; z: number } | null;
}

export interface FireZone {
  kind: 'molotov' | 'tire';
  x: number;
  z: number;
  r: number;
  life: number;
}

export interface GasCloud {
  x: number;
  z: number;
  r: number;
  life: number;
  maxLife: number;
}

export type RiotEvent =
  | { type: 'throw'; fromX: number; fromZ: number; toX: number; toZ: number }
  | { type: 'molotov'; fromX: number; fromZ: number; toX: number; toZ: number }
  | { type: 'tire'; x: number; z: number }
  | { type: 'spray'; fromX: number; fromZ: number; toX: number; toZ: number }
  | { type: 'gas'; fromX: number; fromZ: number; toX: number; toZ: number }
  | { type: 'shot'; fromX: number; fromZ: number; toX: number; toZ: number }
  | { type: 'arrest'; x: number; z: number }
  | { type: 'rescue'; x: number; z: number }
  | { type: 'press'; x: number; z: number }
  | { type: 'extinguish'; x: number; z: number }
  | { type: 'retreat'; unitType: UnitType }
  | { type: 'refuse'; x: number; z: number }
  | { type: 'desert'; x: number; z: number }
  | { type: 'impact'; x: number; z: number; level: number }
  | { type: 'disperse'; x: number; z: number }
  | { type: 'unitBroken'; unitType: UnitType; x: number; z: number }
  | { type: 'deployed'; unitType: UnitType; x: number; z: number }
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
  arrests: number;
  /** Agresiones cerca de la prensa: llegan a todos los noticieros del mundo. */
  pressIncidents: number;
  armyDeployed: number;
  deserted: number;
  /** Botes de gas y disparos usados. */
  harshness: number;
}
