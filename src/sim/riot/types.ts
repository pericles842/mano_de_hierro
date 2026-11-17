import type { CrowdStage } from '../../data/crowdStages';
import type { SpawnId } from '../../data/riots';
import type { UnitType } from '../../data/units';

export type ProtesterKind = 'pacifico' | 'radical' | 'lider' | 'escudero' | 'prensa' | 'medico';
/** 'injured': en el suelo un rato (los médicos pueden levantarlo). 'dead': cuerpo caído, se queda en la plaza. */
export type ProtesterState = 'gathering' | 'advancing' | 'occupying' | 'fleeing' | 'injured' | 'dead' | 'gone';
/** 'arma': arma de fuego (solo con molestia social muy alta y protesta en caos). */
export type Weapon = 'none' | 'piedra' | 'palo' | 'molotov' | 'arma';

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
  /** Punto de concentración o de protesta en la plaza. */
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
  /** Segundos que le quedan en el suelo si está herido. */
  downTimer: number;
  /** Segundos que sigue marcado por el reflector del helicóptero. */
  marked: number;
  /** Perseguido por motorizados: los médicos no pueden recuperarlo. */
  chased: boolean;
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
  /** Segundos hasta el próximo disparo con fuego real. */
  fireCd: number;
  /** Moral de la infantería (0..1). Bajo 0,25 se retira. */
  morale: number;
  retreating: boolean;
  /** Segundos desde el último golpe recibido. */
  sinceHit: number;
  /** El último daño fue letal (bala o fuego): si cae, deja un cuerpo. */
  lastLethal: boolean;
  /** Ejército: segundos que pasará negándose a actuar. */
  refusing: number;
  /** Equipo de captura: líder perseguido. */
  chaseId: number | null;
  /** Persecución ordenada por el jugador (no aborta por densidad de la multitud). */
  manualChase: boolean;
  /** Motorizados: punto de embestida. */
  chargeTo: { x: number; z: number } | null;
  /** Camión lanzagás: objetivo elegido a mano con la tecla F. */
  manualTarget: { x: number; z: number } | null;
  /** Posición que defiende (la última orden del jugador). */
  homeX: number;
  homeZ: number;
  sprayTarget: { x: number; z: number } | null;
}

export interface UnitBody {
  type: UnitType;
  x: number;
  z: number;
  heading: number;
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

export type ShotResult = 'kill' | 'injure' | 'miss';

export type RiotEvent =
  | { type: 'throw'; fromX: number; fromZ: number; toX: number; toZ: number }
  | { type: 'molotov'; fromX: number; fromZ: number; toX: number; toZ: number }
  | { type: 'gunshot'; fromX: number; fromZ: number; toX: number; toZ: number }
  | { type: 'tire'; x: number; z: number }
  | { type: 'spray'; fromX: number; fromZ: number; toX: number; toZ: number }
  | { type: 'gas'; fromX: number; fromZ: number; toX: number; toZ: number }
  | { type: 'shot'; fromX: number; fromZ: number; toX: number; toZ: number; injured: boolean }
  | { type: 'liveShot'; fromX: number; fromZ: number; toX: number; toZ: number; result: ShotResult }
  | { type: 'openFire'; by: 'army' | 'police' }
  | { type: 'killed'; x: number; z: number; kind: ProtesterKind }
  | { type: 'martyr'; x: number; z: number }
  | { type: 'soldierDown'; unitType: UnitType; x: number; z: number }
  | { type: 'charge'; x: number; z: number }
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
  | { type: 'surge' }
  | { type: 'regroup' }
  | { type: 'palaceFallen' }
  | { type: 'wave'; spawn: SpawnId; count: number }
  | { type: 'marchStart' };

export interface RiotResult {
  /** Ganas si el palacio resiste hasta el final. Si llega a 0, pierdes la protesta (y puedes reintentarla). */
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
  palaceFallen: boolean;
  occupiedSeconds: number;
  /** Manifestantes muertos por fuego real. */
  deaths: number;
  injured: number;
  leadersKilled: number;
  /** Agentes y soldados caídos. */
  soldiersKilled: number;
  /** Segundos-tanqueta en la plaza (cuestan presión internacional). */
  tanquetaSeconds: number;
}
