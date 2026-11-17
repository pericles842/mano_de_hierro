import { Random } from '../../core/Random';
import { CROWD_STAGES, STAGE_HYSTERESIS, stageForAnger, type CrowdStage } from '../../data/crowdStages';
import { FORCE_GATES, FORCE_LEVELS } from '../../data/forceLevels';
import type { RiotDef, SpawnId } from '../../data/riots';
import { UNITS, isRooftop, isVehicle, type UnitDef, type UnitType } from '../../data/units';
import { upgradeEffects, type UpgradeEffects, type UpgradeId } from '../../data/upgrades';
import { SpatialGrid } from '../spatialGrid';
import { DEMAND_LIST, type DemandId } from '../../data/demands';
import { OBJECTIVES, OBJECTIVE_LIST, type ObjectiveId, type ObjectiveStats } from '../../data/objectives';
import type { AngerSource } from './types';
import {
  GOAL_Z,
  PALACE,
  PROTESTER_RADIUS,
  SPAWNS,
  clamp,
  constrain,
  exitPoint,
  isDeployable,
  isOnPalaceRoof,
  isOutside,
  nearestExit,
} from './map';
import type {
  FireZone,
  GasCloud,
  Protester,
  ProtesterKind,
  RiotEvent,
  RiotResult,
  ShotResult,
  Unit,
  UnitBody,
  Weapon,
} from './types';

export interface RiotConfig {
  def: RiotDef;
  /** Multiplicador del tamaño de la multitud (crece con los días). */
  scale: number;
  stock: Record<UnitType, number>;
  loyalty: number;
  /** Molestia social del país (0..100): sube la ira inicial y arma a la gente. */
  unrest: number;
  seed: number;
  upgrades?: readonly UpgradeId[];
  /** Segundos de preparación antes de empezar (0 = empieza directamente). */
  planning?: number;
  /** Clima aleatorio de esta protesta. */
  weather?: { night?: boolean; rain?: boolean };
  /** Veteranía (0-3) por tipo de tropa: más aguante, más moral y dispersan mejor. */
  veterans?: Partial<Record<UnitType, number>>;
  /** Mártires recientes: la multitud llega más furiosa. */
  martyrs?: number;
  /** Exigencias a mitad de protesta y objetivo secundario (el tutorial los apaga). */
  demands?: boolean;
  objectives?: boolean;
}

/** Segundos de concentración antes de que arranque la marcha. */
export const PREP_TIME = 15;
/** Segundos de preparación (simulación congelada) para colocar tropas y barricadas. */
export const PLANNING_TIME = 60;
const INITIAL_SHARE = 0.35;
const SEPARATION_DIST = 0.8;
const LEADER_RADIUS = 6;
const THROW_RANGE = 9;
const MOLOTOV_RANGE = 11;
const GUN_RANGE = 12;
const SPRAY_SPLASH = 3.2;
const GAS_RADIUS = 3.6;
const GAS_LIFE = 8;
const PRESS_RADIUS = 8;
const TANQUETA_MAGNET = 12;
/** Distancia máxima a la que la infantería sale de su posición a enfrentar a la multitud, por nivel de fuerza. */
const ENGAGE_LEASH = [0, 6, 10, 16];
/** Cuánto pesa la represión en la ira (menos de 1: la protesta escala más despacio). */
const ESCALATION = 0.6;
/** Francotirador: segundos que tarda en apuntar antes de disparar (con mano dura). */
const SNIPER_AIM = 7;
/** Motorizados: los detenidos se entregan en la puerta del palacio. */
const MOTO_JAIL_Z = -19;
/** Paliza: duración total y segundos entre golpes. */
const BEAT_TIME = 1.8;
const BEAT_STRIKE = 0.45;
const WEAPON_RANK: Record<Weapon, number> = { none: 0, piedra: 1, palo: 2, molotov: 3, arma: 4 };

/** Ira con la que arranca una protesta: su carácter + la molestia acumulada del país. */
export function initialAnger(def: RiotDef, unrest: number): number {
  return clamp(def.aggression * 0.6 + (unrest / 100) * 0.5, 0, 0.95);
}

/**
 * Simulación de una revuelta. TypeScript puro: no conoce Three.js ni el DOM,
 * así que se puede probar con tests y ejecutar sin navegador.
 */
export class RiotSim {
  readonly def: RiotDef;
  readonly protesters: Protester[] = [];
  readonly units: Unit[] = [];
  /** Agentes y soldados caídos (sus cuerpos se quedan en la plaza). */
  readonly bodies: UnitBody[] = [];
  readonly fires: FireZone[] = [];
  readonly gasClouds: GasCloud[] = [];
  readonly available: Record<UnitType, number>;
  /** Manifestantes en total (el camión inhibidor puede reducir los que faltan por llegar). */
  total: number;
  readonly duration: number;
  readonly upgrades: readonly UpgradeId[];
  /** Dirección del viento (arrastra el gas). */
  readonly wind: { x: number; z: number };

  /** Eventos del último paso (para efectos visuales, sonido y noticiero). */
  events: RiotEvent[] = [];
  forceLevel = 0;
  elapsed = 0;
  /** Preparación: mientras quede tiempo, la multitud espera quieta y las barricadas se pueden mover. */
  planningLeft = 0;
  palaceHp = 100;
  anger: number;
  stage: CrowdStage;
  peakStage: CrowdStage;
  marchStarted = false;
  /**
   * La multitud primero protesta en la plaza ('rally') y en algún momento se avalancha hacia el palacio ('surge').
   * Cuándo ocurre depende del azar, de la ira y del tamaño de la multitud.
   */
  crowdMode: 'rally' | 'surge' = 'rally';
  surgeAt: number;
  /** Próxima oleada: por dónde y en cuántos segundos (el helicóptero lo ve venir). */
  nextWaveSpawn: SpawnId;
  nextWaveIn = PREP_TIME + 3;
  palaceFallen = false;
  dispersed = 0;
  spawned = 0;
  brokenUnits = 0;
  tanquetasDeployed = 0;
  arrests = 0;
  pressIncidents = 0;
  armyDeployed = 0;
  deserted = 0;
  harshness = 0;
  deaths = 0;
  injuredCount = 0;
  leadersKilled = 0;
  soldiersKilled = 0;
  tanquetaSeconds = 0;
  result: RiotResult | null = null;

  private readonly rng: Random;
  private readonly grid = new SpatialGrid(2, -52, -26, 52, 40);
  private readonly near: number[] = [];
  private readonly near2: number[] = [];
  private readonly loyalty: number;
  private readonly loyaltyFactor: number;
  private readonly fx: UpgradeEffects;
  private readonly angerFloor: number;
  private readonly spawnDeadline: number;
  /** La molestia es tan alta que algunos radicales llegan con armas de fuego. */
  private readonly firearmsAvailable: boolean;
  private readonly pressIds: number[] = [];
  private readonly deserterIds = new Set<number>();
  private pending: RiotEvent[] = [];
  private forceIntegral = 0;
  private pulseTimer = 0;
  private pulsePaused = false;
  private leadersSpawned = 0;
  /** Líderes de esta protesta: varía alrededor del número base de la revuelta. */
  readonly leaderTotal: number;
  /** Líderes arrestados o abatidos. */
  leadersDown = 0;
  /** Clima: de noche tus tropas rinden menos; la lluvia disipa el gas y el fuego, y desanima a venir. */
  readonly night: boolean;
  readonly rain: boolean;
  /** Ira aportada por cada causa (informe de "por qué escaló"). */
  readonly angerSources: Partial<Record<AngerSource, number>> = {};
  /** Exigencia de la multitud: aparece a mitad de la protesta y el jugador decide. */
  demand: { id: DemandId; accepted: boolean | null } | null = null;
  private readonly demandAt: number;
  private readonly demandId: DemandId;
  /** Objetivo secundario de esta protesta. */
  readonly objective: ObjectiveId | null;
  vehiclesUsed = 0;
  colectivosUsed = 0;
  /** Veteranía por tipo de tropa (0-3). */
  readonly veterans: Partial<Record<UnitType, number>>;
  private nextUnitId = 1;
  private stepCount = 0;
  private sprayingNow = 0;
  private openedFire = { army: false, police: false };

  constructor(cfg: RiotConfig) {
    this.def = cfg.def;
    this.rng = new Random(cfg.seed);
    this.night = cfg.def.night === true || cfg.weather?.night === true;
    this.rain = cfg.weather?.rain === true;
    // Con lluvia viene algo menos de gente.
    this.total = Math.round(cfg.def.protesters * cfg.scale * (this.rain ? 0.9 : 1));
    this.duration = cfg.def.duration;
    this.spawnDeadline = this.duration * 0.65;
    this.available = { ...cfg.stock };
    this.planningLeft = cfg.planning ?? 0;
    this.upgrades = cfg.upgrades ?? [];
    this.anger = Math.min(1, initialAnger(cfg.def, cfg.unrest) + Math.min(0.15, (cfg.martyrs ?? 0) * 0.03));
    this.veterans = cfg.veterans ?? {};
    this.angerFloor = cfg.def.aggression * 0.4;
    this.stage = stageForAnger(this.anger);
    this.peakStage = this.stage;
    this.loyalty = cfg.loyalty;
    this.loyaltyFactor = cfg.def.loyaltySensitive && cfg.loyalty < 50 ? 0.65 : 1;
    this.firearmsAvailable = cfg.unrest >= 55 || cfg.def.aggression >= 0.55;
    this.fx = upgradeEffects(this.upgrades);
    this.surgeAt = PREP_TIME + this.rng.range(10, 50) * (1.15 - this.anger);
    this.leaderTotal = Math.max(1, cfg.def.leaders + this.rng.int(-1, 2));
    // Sorteos de exigencia y objetivo con su propio generador: no alteran el resto de la simulación.
    const extras = new Random(cfg.seed * 31 + 7);
    this.demandId = extras.pick(DEMAND_LIST);
    this.demandAt = cfg.demands !== false && extras.chance(0.75) ? this.duration * extras.range(0.3, 0.55) : Infinity;
    this.objective = cfg.objectives !== false ? extras.pick(OBJECTIVE_LIST) : null;
    this.nextWaveSpawn = this.rng.pick(this.def.spawns);
    const windAngle = this.rng.range(0, Math.PI * 2);
    this.wind = { x: Math.cos(windAngle) * 0.45, z: Math.sin(windAngle) * 0.45 };

    // Concentración inicial: una parte de la multitud espera en las calles de acceso.
    const initial = Math.round(this.total * INITIAL_SHARE);
    for (let i = 0; i < initial; i++) {
      const spawnId = this.def.spawns[i % this.def.spawns.length];
      const area = SPAWNS[spawnId];
      this.spawnOne(spawnId, this.rng.range(area.x[0], area.x[1]), this.rng.range(area.z[0], area.z[1]), 'gathering');
    }
  }

  /** Manifestantes que siguen protestando (la prensa no cuenta). */
  get activeCount(): number {
    let n = 0;
    for (const p of this.protesters) {
      if (p.kind === 'prensa') continue;
      if (p.state === 'advancing' || p.state === 'occupying' || p.state === 'gathering') n++;
    }
    return n;
  }

  get troopsReluctant(): boolean {
    return this.loyaltyFactor < 1;
  }

  get marchStartsIn(): number {
    return Math.max(0, PREP_TIME - this.elapsed);
  }

  /** La multitud está detenida cantando (concentración, protesta en la plaza o pausa). */
  get chanting(): boolean {
    return !this.marchStarted || this.crowdMode === 'rally' || this.pulsePaused;
  }

  /** Fuego real activo: la policía con mano dura o el ejército con perdigones o más. */
  get lethalForce(): boolean {
    return this.forceLevel >= 3 || (this.forceLevel >= 2 && this.units.some((u) => u.type === 'army'));
  }

  // ─── Comandos del jugador ──────────────────────────────────────────────

  /** ¿Puede el jugador colocar esta tropa aquí? Los vehículos salen del palacio (ver dispatchVehicle). */
  canDeploy(type: UnitType, x: number, z: number): boolean {
    if (this.available[type] <= 0 || isVehicle(type)) return false;
    return this.canPlace(type, x, z);
  }

  /** Líderes en pie o por llegar. */
  get leadersLeft(): number {
    const standing = this.protesters.filter((p) => p.kind === 'lider' && (p.state === 'advancing' || p.state === 'occupying' || p.state === 'gathering')).length;
    return standing + (this.leaderTotal - this.leadersSpawned);
  }

  /**
   * Responder a la exigencia. Ceder calma la plaza y una parte se va a casa (el coste para el régimen
   * se aplica al terminar); negarse enfurece.
   */
  resolveDemand(accept: boolean): void {
    if (!this.demand || this.demand.accepted !== null || this.result) return;
    this.demand.accepted = accept;
    if (!accept) {
      this.addAnger(0.12, 'exigencias');
      return;
    }
    this.anger = Math.max(this.angerFloor * 0.5, this.anger - 0.25);
    for (const p of this.protesters) {
      if (!isUpright(p) || p.state === 'fleeing' || p.kind === 'prensa' || !this.rng.chance(0.25)) continue;
      p.state = 'fleeing';
      p.fleeTo = nearestExit(p.x, p.z);
    }
  }

  /** Datos para comprobar el objetivo secundario. */
  get objectiveStats(): ObjectiveStats {
    return {
      leadersDown: this.leadersDown,
      deaths: this.deaths,
      pressIncidents: this.pressIncidents,
      vehiclesUsed: this.vehiclesUsed,
      dispersed: this.dispersed,
      total: this.total,
    };
  }

  /** Vehículo: aparece en la puerta del palacio y se dirige al centro de la plaza. Solo durante la protesta. */
  dispatchVehicle(type: UnitType): Unit | null {
    if (!isVehicle(type) || this.planning || this.result || this.available[type] <= 0) return null;
    for (const ox of [0, -3.5, 3.5, -7, 7]) {
      const unit = this.deploy(type, ox, -19.5, 0);
      if (!unit) continue;
      this.orderMove(unit.id, ox * 0.5, 4);
      unit.holdTimer = 4;
      this.vehiclesUsed++;
      return unit;
    }
    return null;
  }

  /** ¿Cabe una tropa de este tipo aquí? `ignoreId` excluye a la propia tropa (al recolocarla). */
  canPlace(type: UnitType, x: number, z: number, ignoreId = -1): boolean {
    // Francotiradores: solo en la azotea del palacio, y sin amontonarse.
    if (isRooftop(type)) {
      if (this.result || !isOnPalaceRoof(x, z)) return false;
      return this.units.every((u) => u.id === ignoreId || u.type !== 'sniper' || Math.hypot(u.x - x, u.z - z) >= 1.3);
    }
    if (this.result || !isDeployable(x, z)) return false;
    const others = this.units.filter((u) => u.id !== ignoreId);
    if (UNITS[type].flying) return others.every((u) => !UNITS[u.type].flying || Math.hypot(u.x - x, u.z - z) >= 3);
    return others.every((u) => UNITS[u.type].flying || Math.hypot(u.x - x, u.z - z) >= 1.2);
  }

  /** ¿Se pueden mover las barricadas una vez empezada la protesta? */
  get fencesUnlocked(): boolean {
    return this.fx.fences;
  }

  get planning(): boolean {
    return this.planningLeft > 0;
  }

  /** Termina la preparación antes de tiempo. */
  startNow(): void {
    if (!this.planning) return;
    this.planningLeft = 0;
    this.pending.push({ type: 'planningEnd' });
  }

  /** Las barricadas se recogen o recolocan en la preparación (y durante la protesta con vallas desplegables). */
  isRelocatable(unitId: number): boolean {
    const unit = this.units.find((u) => u.id === unitId);
    return !!unit && (this.planning || this.fx.fences) && !this.result && UNITS[unit.type].speed === 0 && !UNITS[unit.type].flying;
  }

  /** Recolocar una barricada en otro punto (conserva el daño que tenga). */
  relocate(unitId: number, x: number, z: number, heading: number): boolean {
    const unit = this.units.find((u) => u.id === unitId);
    if (!unit || !this.isRelocatable(unitId) || !this.canPlace(unit.type, x, z, unitId)) return false;
    // Durante la protesta, nunca encima de la gente.
    if (!this.planning && this.protesterAt(x, z, 2.2)) return false;
    unit.x = unit.px = unit.targetX = unit.homeX = x;
    unit.z = unit.pz = unit.targetZ = unit.homeZ = z;
    unit.heading = heading;
    this.pending.push({ type: 'deployed', unitType: unit.type, x, z });
    return true;
  }

  /** Quitar una barricada: vuelve a la reserva para colocarla en otro sitio. */
  dismantle(unitId: number): boolean {
    if (!this.isRelocatable(unitId)) return false;
    const i = this.units.findIndex((u) => u.id === unitId);
    const unit = this.units[i];
    this.units.splice(i, 1);
    this.available[unit.type]++;
    return true;
  }

  deploy(type: UnitType, x: number, z: number, heading = 0): Unit | null {
    if (this.available[type] <= 0 || !this.canPlace(type, x, z)) return null;
    const def = UNITS[type];
    const vet = this.veterans[type] ?? 0;
    const integrity = def.integrity * this.fx.integrityMult[type] * (1 + 0.1 * vet);
    const ammo = Math.round((def.ammo ?? 0) * this.fx.ammoMult);
    const unit: Unit = {
      id: this.nextUnitId++,
      type,
      x,
      z,
      px: x,
      pz: z,
      heading,
      targetX: x,
      targetZ: z,
      integrity,
      maxIntegrity: integrity,
      water: (def.water ?? 0) * this.fx.waterMult,
      ammo,
      maxAmmo: ammo,
      cooldown: 0,
      fireCd: 0,
      morale: 1,
      retreating: false,
      sinceHit: 99,
      lastLethal: false,
      refusing: 0,
      chaseId: null,
      manualChase: false,
      chargeTo: null,
      manualTarget: null,
      homeX: x,
      homeZ: z,
      sprayTarget: null,
      talking: false,
      pushing: false,
      carryId: null,
      holdTimer: 0,
      beatId: null,
      beatTimer: 0,
      aimId: null,
      aimTimer: 0,
      hidden: false,
    };
    this.available[type]--;
    if (type === 'tanqueta') this.tanquetasDeployed++;
    if (type === 'colectivo') this.colectivosUsed++;
    if (type === 'army') {
      this.armyDeployed++;
      this.addAnger(0.03, 'ejercito'); // los soldados en la calle indignan
      this.notePressIfNear(x, z);
    }
    this.units.push(unit);
    this.pending.push({ type: 'deployed', unitType: type, x, z });
    return unit;
  }

  orderMove(unitId: number, x: number, z: number): boolean {
    const unit = this.units.find((u) => u.id === unitId);
    if (!unit || UNITS[unit.type].speed <= 0) return false;
    unit.targetX = clamp(x, -29, 29);
    unit.targetZ = clamp(z, -20, 29);
    unit.homeX = unit.targetX;
    unit.homeZ = unit.targetZ;
    unit.chaseId = null;
    unit.manualChase = false;
    unit.chargeTo = null;
    unit.retreating = false;
    if (UNITS[unit.type].flying) unit.holdTimer = 12; // luego vuelve a patrullar solo
    return true;
  }

  /** Equipo de captura: ir a por un manifestante concreto (cualquiera salvo la prensa). */
  orderCapture(unitId: number, protesterId: number): boolean {
    const unit = this.units.find((u) => u.id === unitId);
    const target = this.protesters[protesterId];
    if (!unit || unit.type !== 'capture' || !target || target.kind === 'prensa') return false;
    if (target.state !== 'advancing' && target.state !== 'occupying' && target.state !== 'gathering') return false;
    unit.chaseId = target.id;
    unit.manualChase = true;
    unit.retreating = false;
    return true;
  }

  /** Camión lanzagás: próxima salva en el punto indicado (tecla F). */
  orderAbility(unitId: number, x: number, z: number): boolean {
    const unit = this.units.find((u) => u.id === unitId);
    if (!unit || unit.type !== 'gastruck') return false;
    unit.manualTarget = { x, z };
    return true;
  }

  /** Líder más cercano a un punto (para órdenes de captura con clic derecho). */
  leaderAt(x: number, z: number, radius: number): Protester | null {
    return this.protesterAt(x, z, radius, (p) => p.kind === 'lider');
  }

  /** Manifestante en pie más cercano a un punto (para el ratón y las órdenes de captura). */
  protesterAt(x: number, z: number, radius: number, filter: (p: Protester) => boolean = () => true): Protester | null {
    let best: Protester | null = null;
    let bestD = radius;
    for (const p of this.protesters) {
      if ((p.state !== 'advancing' && p.state !== 'occupying' && p.state !== 'gathering') || !filter(p)) continue;
      const d = Math.hypot(p.x - x, p.z - z);
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
    return best;
  }

  /** MODO DEVELOPER (temporal): todas las tropas disponibles. */
  devUnlockAll(): void {
    for (const type of Object.keys(this.available) as UnitType[]) this.available[type] = 99;
  }

  setForce(level: number): void {
    this.forceLevel = clamp(Math.round(level), 0, FORCE_LEVELS.length - 1);
  }

  // ─── Paso de simulación ────────────────────────────────────────────────

  step(dt: number): void {
    if (this.result) return;
    this.events = this.pending;
    this.pending = [];
    if (this.planningLeft > 0) {
      // La multitud espera, pero tus tropas sí pueden ir a sus posiciones.
      this.moveUnits(dt);
      this.planningLeft -= dt;
      if (this.planningLeft <= 0) {
        this.planningLeft = 0;
        this.events.push({ type: 'planningEnd' });
      }
      return;
    }
    this.stepCount++;
    this.elapsed += dt;
    this.forceIntegral += this.forceLevel * dt;

    this.updateAnger(dt);
    this.updateStage();
    this.updatePhase(dt);
    if (this.demand === null && this.marchStarted && this.elapsed >= this.demandAt) {
      this.demand = { id: this.demandId, accepted: null };
      this.events.push({ type: 'demand', id: this.demandId });
    }
    this.updateCrowdMode(dt);
    this.spawnWaves(dt);
    this.moveUnits(dt);
    this.moveProtesters(dt);
    this.rebuildGrid();
    this.sprayingNow = 0;
    for (const unit of this.units) {
      this.updateMorale(unit, dt);
      this.unitInteractions(unit, dt);
      this.unitAbility(unit, dt);
      this.presence(unit, dt);
      if (unit.type === 'tanqueta') this.tanquetaSeconds += dt;
    }
    this.updateGas(dt);
    this.updateFires(dt);
    this.protesterActions(dt);
    this.removeBrokenUnits();
    this.checkEnd();
  }

  /**
   * Sube la ira y apunta la causa. La represión pesa ESCALATION veces: la protesta escala,
   * pero dando tiempo a jugar los niveles intermedios.
   */
  addAnger(amount: number, source: AngerSource): void {
    if (amount <= 0) return;
    const scaled = source === 'multitud' ? amount : amount * ESCALATION;
    const before = this.anger;
    this.anger = Math.min(1, this.anger + scaled);
    this.angerSources[source] = (this.angerSources[source] ?? 0) + (this.anger - before);
  }

  /** La ira sube con la represión y con el tamaño de la multitud; baja si solo contienes. */
  private updateAnger(dt: number): void {
    this.addAnger(FORCE_LEVELS[this.forceLevel].angerPerSec * dt, 'fuerza');
    let provoke = 0;
    for (const u of this.units) {
      if (u.refusing > 0) continue;
      provoke += UNITS[u.type].provoke ?? 0;
    }
    this.addAnger(provoke * dt, 'provocacion');
    this.addAnger(this.sprayingNow * 0.001 * dt, 'gas');
    // Las protestas van de menos a más: la molestia del país y el tamaño de la multitud calientan el ambiente.
    if (this.marchStarted) {
      this.addAnger(((this.def.aggression * 0.5 + this.anger * 0.3) * 0.004 + Math.min(1, this.activeCount / 250) * 0.0015) * dt, 'multitud');
    }
    // Con contención la multitud se va calmando (sin bajar del suelo de la revuelta).
    if (this.forceLevel === 0) this.anger = Math.max(Math.min(this.anger, this.angerFloor), this.anger - 0.0035 * this.fx.calmMult * dt);
  }

  private updateStage(): void {
    let s = this.stage;
    while (s < 3 && this.anger >= CROWD_STAGES[s + 1].threshold) s++;
    while (s > 0 && this.anger < CROWD_STAGES[s].threshold - STAGE_HYSTERESIS) s--;
    if (s === this.stage) return;
    const up = s > this.stage;
    this.stage = s as CrowdStage;
    this.peakStage = Math.max(this.peakStage, this.stage) as CrowdStage;
    this.events.push({ type: 'escalate', stage: this.stage, up });
    if (up) for (const p of this.protesters) if (isUpright(p) && p.state !== 'fleeing') this.arm(p, true);
  }

  private updatePhase(dt: number): void {
    if (!this.marchStarted && this.elapsed >= PREP_TIME) {
      this.marchStarted = true;
      for (const p of this.protesters) {
        if (p.state !== 'gathering') continue;
        p.state = 'advancing';
        this.assignRallySpot(p);
      }
      this.events.push({ type: 'marchStart' });
    }
    const sd = CROWD_STAGES[this.stage];
    if (this.marchStarted && sd.pause > 0) {
      this.pulseTimer += dt;
      this.pulsePaused = this.pulseTimer % (sd.march + sd.pause) > sd.march;
    } else {
      this.pulsePaused = false;
    }
  }

  /** ¿Se avalanchan? Puede pasar en cualquier momento, antes cuanto más enfadada y numerosa es la multitud. */
  private updateCrowdMode(dt: number): void {
    if (!this.marchStarted) return;
    if (this.crowdMode === 'rally') {
      const crowdPressure = Math.min(1, this.activeCount / 300);
      const spontaneous = this.rng.chance(dt * (0.003 + this.anger * 0.02 + crowdPressure * 0.006));
      if (this.elapsed >= this.surgeAt || this.stage >= 2 || spontaneous) this.surge();
    } else if (this.stage === 0 && this.anger < 0.2 && this.rng.chance(dt * 0.03)) {
      this.crowdMode = 'rally';
      this.surgeAt = this.elapsed + this.rng.range(15, 40);
      for (const p of this.protesters) if (p.state === 'advancing') this.assignRallySpot(p);
      this.events.push({ type: 'regroup' });
    }
  }

  private surge(): void {
    if (this.crowdMode === 'surge') return;
    this.crowdMode = 'surge';
    this.events.push({ type: 'surge' });
  }

  /** Radicales que, en cuanto hay tensión, van por su cuenta hacia el palacio aunque el resto proteste. */
  private isVanguard(p: Protester): boolean {
    return this.stage >= 1 && (p.kind === 'radical' || p.kind === 'escudero');
  }

  private assignRallySpot(p: Protester): void {
    p.homeX = clamp(p.targetX * 2.2 + this.rng.range(-4, 4), -24, 24);
    p.homeZ = this.rng.range(2, 16);
  }

  /** Oleadas: más frecuentes y caóticas cuanto más enfadada está la gente. */
  private spawnWaves(dt: number): void {
    if (this.spawned >= this.total || !this.marchStarted) return;
    this.nextWaveIn -= dt;
    const remaining = this.total - this.spawned;
    if (this.nextWaveIn > 0 && this.elapsed < this.spawnDeadline) return;

    const interval = 16 - this.anger * 10;
    const wavesLeft = Math.max(1, Math.floor((this.spawnDeadline - this.elapsed) / interval));
    const size = this.elapsed >= this.spawnDeadline ? remaining : Math.ceil(remaining / wavesLeft);
    this.nextWaveIn = interval;

    const spawnId = this.nextWaveSpawn;
    this.nextWaveSpawn = this.rng.pick(this.def.spawns);
    const area = SPAWNS[spawnId];
    const cx = this.rng.range(area.x[0], area.x[1]);
    const cz = this.rng.range(area.z[0], area.z[1]);
    // Motorizados en la boca de la calle: la oleada llega desmoralizada.
    const blocked = this.units.some((u) => u.type === 'moto' && Math.hypot(u.x - clamp(cx, -30, 30), u.z - clamp(cz, -20, 30)) < 12);
    for (let i = 0; i < size; i++) {
      this.spawnOne(spawnId, cx + this.rng.range(-3, 3), cz + this.rng.range(-3, 3), 'advancing');
      if (blocked) this.protesters[this.protesters.length - 1].resolve *= 0.6;
    }
    this.events.push({ type: 'wave', spawn: spawnId, count: size });
  }

  private pickKind(): ProtesterKind {
    const remaining = Math.max(1, this.total - this.spawned);
    const leadersLeft = this.leaderTotal - this.leadersSpawned;
    if (leadersLeft > 0 && this.rng.chance(leadersLeft / remaining)) {
      this.leadersSpawned++;
      return 'lider';
    }
    const pressQuota = Math.max(2, Math.round(this.total * 0.02));
    if (this.pressIds.length < pressQuota && this.rng.chance(0.04)) return 'prensa';
    if (this.stage >= 1 && this.rng.chance(0.03)) return 'medico';
    if (this.stage >= 2 && this.rng.chance(this.def.radicalShare * 0.6)) return 'escudero';
    if (this.rng.chance(this.def.radicalShare)) return 'radical';
    return 'pacifico';
  }

  private spawnOne(spawnId: SpawnId, x: number, z: number, state: 'gathering' | 'advancing'): void {
    const kind = this.pickKind();
    const baseResolve: Record<ProtesterKind, number> = { pacifico: 1, radical: 1.3, lider: 1.6, escudero: 1.8, prensa: 3, medico: 1.4 };
    const maxResolve = baseResolve[kind] * this.def.resolveMult;
    const p: Protester = {
      id: this.protesters.length,
      kind,
      model: kind === 'radical' ? 3 : kind === 'lider' ? 4 : this.rng.int(0, 2),
      weapon: 'none',
      masked: kind !== 'prensa' && this.stage >= 1 && this.rng.chance(0.1 + 0.12 * this.stage),
      x,
      z,
      px: x,
      pz: z,
      vx: 0,
      vz: 0,
      homeX: x,
      homeZ: z,
      speed: (kind === 'radical' ? 2.7 : 2.2) * this.def.speedMult * this.rng.range(0.85, 1.15),
      resolve: maxResolve,
      maxResolve,
      state,
      targetX: this.rng.range(-PALACE.halfWidth + 1, PALACE.halfWidth - 1),
      fleeTo: spawnId,
      throwCd: this.rng.range(1, 3),
      downTimer: 0,
      marked: 0,
      chased: false,
    };
    this.arm(p, false);
    if (state === 'advancing') this.assignRallySpot(p);
    if (kind === 'prensa') this.pressIds.push(p.id);
    this.protesters.push(p);
    this.spawned++;
  }

  /** A más ira, más gente armada. Con molestia social extrema aparecen armas de fuego. */
  private arm(p: Protester, escalating: boolean): void {
    if (p.kind === 'lider' || p.kind === 'prensa' || p.kind === 'medico' || p.kind === 'escudero') return;
    if (escalating && this.stage >= 1 && !p.masked) p.masked = this.rng.chance(0.15 * this.stage);
    if (escalating && p.kind === 'radical' && this.stage >= 2 && this.rng.chance(0.2)) {
      p.kind = 'escudero';
      p.weapon = 'none';
      p.maxResolve = p.resolve = Math.max(p.resolve, 1.8 * this.def.resolveMult);
      return;
    }
    const r = this.rng.next();
    let w: Weapon = 'none';
    if (p.kind === 'radical') {
      if (this.stage >= 3) w = this.firearmsAvailable && r < 0.18 ? 'arma' : r < 0.55 ? 'molotov' : 'piedra';
      else if (this.stage >= 2) w = r < 0.3 ? 'palo' : 'piedra';
      else if (this.stage >= 1) w = 'piedra';
    } else {
      if (this.stage >= 3) w = r < 0.3 ? 'palo' : r < 0.5 ? 'piedra' : 'none';
      else if (this.stage >= 2) w = r < 0.15 ? 'palo' : r < 0.25 ? 'piedra' : 'none';
      else if (this.stage >= 1) w = r < 0.05 ? 'piedra' : 'none';
    }
    if (WEAPON_RANK[w] > WEAPON_RANK[p.weapon]) {
      p.weapon = w;
      if (w === 'palo') p.maxResolve = p.resolve = Math.max(p.resolve, p.maxResolve * 1.2);
    }
  }

  private moveUnits(dt: number): void {
    for (const u of this.units) {
      u.px = u.x;
      u.pz = u.z;
      const def = UNITS[u.type];
      if (def.speed <= 0) continue;
      const dx = u.targetX - u.x;
      const dz = u.targetZ - u.z;
      const d = Math.hypot(dx, dz);
      if (d > 0.05) {
        const boost = u.chargeTo ? 1.4 : 1;
        const s = Math.min(d, def.speed * boost * dt);
        u.x += (dx / d) * s;
        u.z += (dz / d) * s;
        u.heading = Math.atan2(dx, dz);
      }
    }
  }

  private moveProtesters(dt: number): void {
    const blend = Math.min(1, dt * 4);
    const stageSpeed = CROWD_STAGES[this.stage].speedMult;
    const tanquetas = this.units.filter((u) => u.type === 'tanqueta');
    for (const p of this.protesters) {
      if (!isUpright(p)) continue;
      p.px = p.x;
      p.pz = p.z;

      let desX = 0;
      let desZ = 0;
      let target: { x: number; z: number } | null = null;
      let speed = p.speed;
      const protestingInPlaza = p.state === 'advancing' && this.crowdMode === 'rally' && !this.isVanguard(p);
      if (p.state === 'gathering' || protestingInPlaza) {
        target = { x: p.homeX, z: p.homeZ };
        const far = Math.hypot(p.homeX - p.x, p.homeZ - p.z) > 1.5;
        speed = far ? (p.state === 'gathering' ? 1.2 : p.speed * stageSpeed) : 0;
      } else if (p.state === 'advancing' && !this.pulsePaused) {
        target = { x: p.targetX, z: GOAL_Z };
        speed *= stageSpeed;
      } else if (p.state === 'fleeing') {
        target = exitPoint(p.fleeTo, p.x, p.z);
        speed *= p.chased ? 2.2 : 1.7;
      }
      if (target && speed > 0) {
        const dx = target.x - p.x;
        const dz = target.z - p.z;
        const d = Math.hypot(dx, dz) || 1;
        desX = (dx / d) * speed;
        desZ = (dz / d) * speed;
      }

      if (p.state === 'advancing' || p.state === 'occupying') {
        // Cortina de gas: nadie quiere meterse en la nube.
        for (const g of this.gasClouds) {
          const dx = p.x - g.x;
          const dz = p.z - g.z;
          const d = Math.hypot(dx, dz);
          if (d < g.r + 1 && d > 1e-3) {
            const push = (p.masked || p.kind === 'escudero' ? 1 : 2.6) * (1 - d / (g.r + 1));
            desX += (dx / d) * push * p.speed;
            desZ += (dz / d) * push * p.speed;
          }
        }
        // Zona de miedo de la tanqueta: la gente tranquila se da la vuelta (cada vez menos según escala).
        const fearFactor = UNITS.tanqueta.presence?.byStage[this.stage] ?? 0;
        if (!this.isVanguard(p) && fearFactor > 0) {
          for (const t of tanquetas) {
            const dx = p.x - t.x;
            const dz = p.z - t.z;
            const d = Math.hypot(dx, dz);
            const r = UNITS.tanqueta.fearAura ?? 10;
            if (d < r && d > 1e-3) {
              desX += (dx / d) * 2 * p.speed * (1 - d / r) * fearFactor;
              desZ += (dz / d) * 2 * p.speed * (1 - d / r) * fearFactor;
            }
          }
        }
      }

      this.grid.query(p.x, p.z, SEPARATION_DIST, this.near);
      for (const j of this.near) {
        if (j === p.id) continue;
        const q = this.protesters[j];
        if (!isUpright(q)) continue;
        const ox = p.x - q.x;
        const oz = p.z - q.z;
        const d = Math.hypot(ox, oz);
        if (d > 1e-4 && d < SEPARATION_DIST) {
          const push = (SEPARATION_DIST - d) * 6;
          desX += (ox / d) * push;
          desZ += (oz / d) * push;
        }
      }

      p.vx += (desX - p.vx) * blend;
      p.vz += (desZ - p.vz) * blend;
      p.x += p.vx * dt;
      p.z += p.vz * dt;
      constrain(p);

      if (p.state === 'advancing' && p.z <= GOAL_Z + 0.4 && Math.abs(p.x) <= PALACE.halfWidth) p.state = 'occupying';
    }
  }

  private rebuildGrid(): void {
    this.grid.clear();
    for (const p of this.protesters) if (p.state !== 'gone' && p.state !== 'dead') this.grid.insert(p.id, p.x, p.z);
  }

  // ─── Tropas ────────────────────────────────────────────────────────────

  private hurt(u: Unit, damage: number, lethal = false): void {
    u.integrity -= damage;
    u.sinceHit = 0;
    u.lastLethal = lethal;
    if (UNITS[u.type].infantry) u.morale = Math.max(0, u.morale - (damage * 1.5) / u.maxIntegrity);
  }

  /** La infantería bajo una lluvia de golpes pierde moral y se repliega hacia el palacio. */
  private updateMorale(u: Unit, dt: number): void {
    u.sinceHit += dt;
    u.cooldown = Math.max(0, u.cooldown - dt);
    u.fireCd = Math.max(0, u.fireCd - dt);
    u.refusing = Math.max(0, u.refusing - dt);
    u.holdTimer = Math.max(0, u.holdTimer - dt);
    if (!UNITS[u.type].infantry) return;
    if (u.sinceHit > 3) u.morale = Math.min(1, u.morale + (0.1 + 0.05 * (this.veterans[u.type] ?? 0)) * dt);
    if (!u.retreating && u.morale < 0.25) {
      u.retreating = true;
      u.chaseId = null;
      u.targetX = u.x;
      u.targetZ = Math.max(-18, Math.min(u.z, -12));
      this.events.push({ type: 'retreat', unitType: u.type });
    } else if (u.retreating && u.morale > 0.7) {
      u.retreating = false;
    }
  }

  private active(u: Unit): boolean {
    return !u.retreating && u.refusing <= 0;
  }

  /** De noche tus tropas rinden menos. */
  private nightFactor(u: Unit): number {
    void u;
    return this.night ? 0.8 : 1;
  }

  private unitInteractions(u: Unit, dt: number): void {
    const def = UNITS[u.type];
    if (def.flying) return;
    const force = FORCE_LEVELS[this.forceLevel];
    const resist = 1 - this.anger * 0.5;
    const canAct = this.active(u);
    const melee = (u.type === 'soldier' ? this.fx.meleeMult : 1) * this.nightFactor(u) * (1 + 0.06 * (this.veterans[u.type] ?? 0));
    const charging = u.chargeTo !== null;
    const intimidates = canAct && this.forceLevel >= FORCE_GATES.gas && (u.type === 'soldier' || u.type === 'shield' || u.type === 'capture');
    const [ax, az] = segmentAxis(u, def);
    const contactDist = def.radius + PROTESTER_RADIUS;
    const reach = def.halfLength + Math.max(contactDist, def.pushRadius + def.radius, def.fearAura ?? 0) + 0.5;
    let contacts = 0;

    this.grid.query(u.x, u.z, reach, this.near);
    for (const i of this.near) {
      const p = this.protesters[i];
      if (!isUpright(p)) continue;

      const along = (p.x - u.x) * ax + (p.z - u.z) * az;
      const t = clamp(along, -def.halfLength, def.halfLength);
      const cx = u.x + ax * t;
      const cz = u.z + az * t;
      let nx = p.x - cx;
      let nz = p.z - cz;
      let d = Math.hypot(nx, nz);
      if (d < 1e-4) {
        nx = Math.sin(u.heading);
        nz = Math.cos(u.heading);
        d = 1e-4;
      } else {
        nx /= d;
        nz /= d;
      }

      // Muros (barricadas, escudos): si alguien cruzó la línea en este paso, vuelve a su lado.
      if (def.axis === 'x' && def.halfLength > 0 && Math.abs(along) <= def.halfLength + contactDist) {
        const wx = Math.sin(u.heading);
        const wz = Math.cos(u.heading);
        const sideNow = (p.x - u.x) * wx + (p.z - u.z) * wz;
        const sidePrev = (p.px - u.x) * wx + (p.pz - u.z) * wz;
        if (sideNow * sidePrev < 0 && Math.abs(sidePrev) > 1e-3) {
          const s = Math.sign(sidePrev);
          nx = wx * s;
          nz = wz * s;
          d = 0;
        }
      }

      if (d < contactDist) {
        p.x = cx + nx * contactDist;
        p.z = cz + nz * contactDist;
        p.vx *= 0.5;
        p.vz *= 0.5;
        if (p.state === 'advancing' || p.state === 'occupying') {
          const stick = p.weapon === 'palo' && this.stage >= 2;
          this.hurt(u, (stick ? 4 : 1.2) * dt * this.fx.bruiseMult[u.type], stick && this.stage >= 3);
          // Muros con pinchos: empujar contra la barricada desanima y puede herir.
          if (u.type === 'barricade' && this.fx.spikes) {
            p.resolve -= 0.35 * dt;
            if (p.kind !== 'prensa' && this.rng.chance(dt * 0.12)) {
              this.injure(p, 4);
              continue;
            }
          }
        }
        d = contactDist;
      }

      if (p.state === 'fleeing' || !canAct) continue;
      const shieldF = p.kind === 'escudero' ? 0.5 : 1;

      if (def.pushRadius > 0 && d <= def.pushRadius + def.radius) {
        p.resolve -= def.dispersal * force.dispersalMult * melee * dt * resist * this.loyaltyFactor * shieldF;
        const kb = force.knockback * melee + (charging ? 5 : 0);
        if (kb > 0) {
          p.x += nx * kb * dt * shieldF;
          p.z += nz * kb * dt * shieldF;
        }
        if (charging) p.resolve -= 0.5 * dt * shieldF;
        contacts++;
      }
      if (u.type === 'army' && def.fearAura && d <= def.fearAura) p.resolve -= 0.15 * dt * resist;
      // Contención agresiva: gritos, empujones y cacheos intimidan alrededor.
      if (intimidates && d <= def.pushRadius + def.radius + 1.5) p.resolve -= 0.05 * dt * resist * shieldF;
    }

    u.pushing = contacts > 0 && def.infantry;
    // Fuerza dispersiva: antidisturbios y muros agarran a alguien y le dan una paliza.
    if ((u.type === 'soldier' || u.type === 'shield') && canAct && contacts > 0 && this.forceLevel >= FORCE_GATES.rubber && u.cooldown <= 0 && u.beatId === null) {
      this.beat(u, def);
    }

    if ((u.type === 'soldier' || u.type === 'shield' || u.type === 'army') && isIdle(u) && canAct) {
      const p = this.nearestProtester(u.x, u.z, 14, 0);
      if (p) turnToward(u, p.x, p.z, dt * 3);
    }

    if (contacts > 0 && this.forceLevel > 0 && this.rng.chance(dt * 2.5)) {
      this.addAnger(0.002 * this.forceLevel * (u.type === 'soldier' ? this.fx.meleeMult : 1), 'palizas');
      const ix = u.x + Math.sin(u.heading) * 1.2;
      const iz = u.z + Math.cos(u.heading) * 1.2;
      this.events.push({ type: 'impact', x: ix, z: iz, level: this.forceLevel });
      this.notePressIfNear(ix, iz);
    }
  }

  private unitAbility(u: Unit, dt: number): void {
    const def = UNITS[u.type];
    switch (u.type) {
      case 'soldier':
        if (this.holdBeating(u, def, dt)) break;
        this.engage(u, def);
        this.pistol(u, 1.8);
        break;
      case 'shield':
        if (this.holdBeating(u, def, dt)) break;
        this.engage(u, def);
        this.pistol(u, 2.2);
        break;
      case 'army':
        this.armyLoyaltyCheck(u, dt);
        this.engage(u, def);
        if (this.forceLevel >= 2 && this.active(u)) this.fireLive(u, 15, 0.9, 0.5, 'army');
        break;
      case 'ballena':
        this.spray(u, def, dt);
        break;
      case 'gasser':
        if (this.active(u) && this.forceLevel >= FORCE_GATES.gas && u.ammo >= 1 && u.cooldown <= 0) {
          const t = this.nearestProtester(u.x, u.z, def.range ?? 15, 4);
          if (t) this.launchGas(u, def, t.x, t.z, false);
        }
        this.pistol(u, 2.2);
        break;
      case 'gastruck':
        if (this.forceLevel >= FORCE_GATES.gas && u.ammo >= 1 && u.cooldown <= 0) {
          const t = u.manualTarget ?? this.densestPoint(u.x, u.z, def.range ?? 17, 4);
          if (t) this.launchGas(u, def, t.x, t.z, true);
          u.manualTarget = null;
        }
        break;
      case 'shotgun':
        if (this.active(u) && u.ammo >= 1 && u.cooldown <= 0) {
          if (this.forceLevel >= FORCE_GATES.lethal) {
            if (this.fireLive(u, def.range ?? 11, def.cooldown ?? 1.2, 0.3, 'police')) u.ammo -= 1;
          } else if (this.forceLevel >= FORCE_GATES.rubber) {
            this.shootRubber(u, def);
          }
        }
        break;
      case 'moto':
        this.motoCharge(u, def);
        if (u.chargeTo === null && u.carryId === null) this.pistol(u, 2.2);
        break;
      case 'capture':
        this.capture(u, def);
        if (u.chaseId === null) this.pistol(u, 2);
        break;
      case 'negotiator':
        this.negotiate(u, def, dt);
        break;
      case 'sniper':
        this.sniper(u, dt);
        break;
      case 'colectivo':
        this.colectivo(u);
        break;
      case 'supply':
        for (const other of this.units) {
          if (other === u || Math.hypot(other.x - u.x, other.z - u.z) > (def.range ?? 7)) continue;
          other.ammo = Math.min(other.maxAmmo, other.ammo + other.maxAmmo * 0.08 * dt);
          const maxWater = (UNITS[other.type].water ?? 0) * this.fx.waterMult;
          other.water = Math.min(maxWater, other.water + 1.5 * dt);
          other.morale = Math.min(1, other.morale + 0.1 * dt);
        }
        break;
      default:
        break;
    }
  }

  /**
   * La infantería no se queda quieta mirando: según el nivel de fuerza sale a enfrentar a la multitud
   * dentro de un radio alrededor de su posición, y vuelve cuando no hay nadie.
   */
  private engage(u: Unit, def: UnitDef): void {
    if (!this.active(u) || u.chaseId !== null) return;
    const leash = ENGAGE_LEASH[this.forceLevel];
    if (leash <= 0) {
      if (Math.hypot(u.targetX - u.homeX, u.targetZ - u.homeZ) > 0.1) {
        u.targetX = u.homeX;
        u.targetZ = u.homeZ;
      }
      return;
    }
    const p = this.nearestProtester(u.homeX, u.homeZ, leash + def.pushRadius, 0);
    if (!p) {
      u.targetX = u.homeX;
      u.targetZ = u.homeZ;
      return;
    }
    const dx = p.x - u.x;
    const dz = p.z - u.z;
    const d = Math.hypot(dx, dz) || 1;
    const stop = def.pushRadius * 0.6 + def.radius;
    if (d > stop) {
      u.targetX = clamp(u.x + (dx / d) * (d - stop), -32, 32);
      u.targetZ = clamp(u.z + (dz / d) * (d - stop), -20, 34);
    } else {
      u.targetX = u.x;
      u.targetZ = u.z;
    }
  }

  /**
   * Presencia intimidante de vehículos y motos, a cualquier nivel de fuerza.
   * Cada uno reacciona distinto: los tranquilos se asustan y pierden ánimo;
   * radicales, escuderos y líderes no se achantan: se enfadan y calientan la plaza.
   */
  private presence(u: Unit, dt: number): void {
    const pr = UNITS[u.type].presence;
    if (!pr || !this.active(u)) return;
    const mult = pr.byStage[this.stage];
    if (mult <= 0) return;
    const resist = 1 - this.anger * 0.5;
    let annoyed = 0;
    this.grid.query(u.x, u.z, pr.radius, this.near2);
    for (const i of this.near2) {
      const p = this.protesters[i];
      if (!isUpright(p) || p.state === 'fleeing' || p.state === 'gathering' || p.kind === 'prensa') continue;
      if (Math.hypot(p.x - u.x, p.z - u.z) > pr.radius) continue;
      if (p.kind === 'radical' || p.kind === 'escudero' || p.kind === 'lider') {
        annoyed++;
        continue;
      }
      const temper = 0.5 + ((p.id * 37) % 11) / 10; // de 0,5 a 1,5: unos se asustan más que otros
      p.resolve -= pr.strength * mult * resist * temper * dt;
    }
    if (annoyed > 0) this.addAnger(pr.strength * 0.004 * Math.min(annoyed, 8) * mult * dt, 'provocacion');
  }

  /**
   * Francotirador: vigila desde la azotea y marca al objetivo de más valor (armados > líderes >
   * radicales) para que capturas y motos vayan a por él. Con mano dura lo asesina, pero tarda
   * SNIPER_AIM s en apuntar. La gente no sabe que está ahí hasta que dispara: entonces cunde el terror.
   */
  private sniper(u: Unit, dt: number): void {
    const range = UNITS.sniper.range ?? 45;
    const current = u.aimId !== null ? this.protesters[u.aimId] : null;
    const stillValid = current && isUpright(current) && current.state !== 'fleeing' && current.state !== 'gathering'
      && Math.hypot(current.x - u.x, current.z - u.z) <= range;
    if (!stillValid) {
      u.aimId = this.highValueTarget(u, range);
      u.aimTimer = SNIPER_AIM;
      if (u.aimId === null) return;
    }
    const p = this.protesters[u.aimId!];
    p.marked = Math.max(p.marked, 1.5); // marcado mientras lo vigila
    u.heading = Math.atan2(p.x - u.x, p.z - u.z);
    if (this.forceLevel < FORCE_GATES.lethal) {
      u.aimTimer = SNIPER_AIM; // sin mano dura solo vigila
      return;
    }
    u.aimTimer -= dt;
    if (u.aimTimer > 0) return;

    if (!this.openedFire.police) {
      this.openedFire.police = true;
      this.events.push({ type: 'openFire', by: 'police' });
    }
    this.harshness += 0.5;
    const hit = this.rng.chance(0.85);
    if (hit) this.kill(p);
    this.events.push({ type: 'liveShot', fromX: u.x, fromZ: u.z, toX: p.x, toZ: p.z, result: hit ? 'kill' : 'miss' });
    this.notePressIfNear(p.x, p.z, hit ? 2 : 1);
    this.terror(p.x, p.z, 14, 0.35);
    u.aimId = null;
    u.aimTimer = SNIPER_AIM;
  }

  /** Objetivo de más valor al alcance que no esté vigilando ya otro francotirador. */
  private highValueTarget(u: Unit, range: number): number | null {
    const taken = new Set(this.units.filter((o) => o !== u && o.aimId !== null).map((o) => o.aimId));
    let best: Protester | null = null;
    let bestScore = Infinity;
    for (const p of this.protesters) {
      if (!isUpright(p) || p.state === 'fleeing' || p.state === 'gathering' || p.kind === 'prensa' || taken.has(p.id)) continue;
      const d = Math.hypot(p.x - u.x, p.z - u.z);
      if (d > range) continue;
      const priority = p.weapon === 'arma' || p.weapon === 'molotov' ? 0 : p.kind === 'lider' ? 1 : p.kind === 'radical' || p.kind === 'escudero' ? 2 : -1;
      if (priority < 0) continue;
      const score = priority * 100 + d;
      if (score < bestScore) {
        bestScore = score;
        best = p;
      }
    }
    return best ? best.id : null;
  }

  /**
   * Terror tras un disparo: los tranquilos de alrededor pierden ánimo (cada uno distinto) y toda
   * la plaza se encoge un poco; los radicales, en cambio, se enfurecen.
   */
  private terror(x: number, z: number, radius: number, strength: number): void {
    let angry = 0;
    for (const q of this.protesters) {
      if (!isUpright(q) || q.state === 'fleeing') continue;
      const near = Math.hypot(q.x - x, q.z - z) < radius;
      if (q.kind === 'radical' || q.kind === 'escudero' || q.kind === 'lider') {
        if (near) angry++;
        continue;
      }
      const temper = 0.5 + ((q.id * 37) % 11) / 10;
      q.resolve -= q.maxResolve * (near ? strength * temper : 0.04);
    }
    this.addAnger(0.01 + Math.min(angry, 10) * 0.002, 'disparos');
  }

  /**
   * Colectivo paramilitar, a pie y sin uniforme: busca esconderse entre la multitud (o se queda en
   * su esquina) y desde ahí dispara con pistola a la gente cada pocos segundos, a cualquier nivel de
   * fuerza. Cada disparo aterroriza; a veces hiere y, con la plaza encendida, mata.
   */
  private colectivo(u: Unit): void {
    // ¿Escondido? Entre la multitud o pegado a los bordes de la plaza (esquinas, bocacalles).
    const edge = Math.abs(u.x) >= 23 || u.z <= -16 || u.z >= 25;
    u.hidden = edge || this.crowdAround(u.x, u.z, 3) >= 4;
    if (!this.active(u)) return;

    // Se cuela en el grupo más cercano a su puesto (sin alejarse demasiado de él).
    if (this.stepCount % 30 === u.id % 30) {
      const spot = this.densestPoint(u.homeX, u.homeZ, 14, 0);
      if (spot && spot.count >= 4) {
        const dx = u.x - spot.x;
        const dz = u.z - spot.z;
        const d = Math.hypot(dx, dz) || 1;
        u.targetX = clamp(spot.x + (dx / d) * 2.5, -29, 29);
        u.targetZ = clamp(spot.z + (dz / d) * 2.5, -20, 29);
      } else {
        u.targetX = u.homeX;
        u.targetZ = u.homeZ;
      }
    }

    if (u.cooldown > 0) return;
    const target = this.nearestProtester(u.x, u.z, UNITS.colectivo.range ?? 10, 0);
    if (!target) return;
    u.cooldown = this.rng.range(3, 5);
    u.heading = Math.atan2(target.x - u.x, target.z - u.z);
    const roll = this.rng.next();
    const killChance = 0.06 + (this.anger > 0.55 ? 0.1 : 0);
    const result: ShotResult = roll < killChance ? 'kill' : roll < killChance + 0.25 ? 'injure' : 'miss';
    if (result === 'kill') this.kill(target);
    else if (result === 'injure') this.injure(target, 6);
    this.harshness += 0.2;
    this.events.push({ type: 'liveShot', fromX: u.x, fromZ: u.z, toX: target.x, toZ: target.z, result });
    if (!u.hidden) this.notePressIfNear(target.x, target.z, 0.5);
    this.terror(target.x, target.z, 6, 0.3);
  }

  /**
   * Cae un líder (arrestado o abatido): toda la plaza se desmoraliza, por muy alto que esté el conflicto.
   * Los de alrededor, mucho más.
   */
  private leaderDown(p: Protester, how: 'arrest' | 'killed'): void {
    this.leadersDown++;
    for (const q of this.protesters) {
      if (q === p || !isUpright(q) || q.state === 'fleeing') continue;
      const near = Math.hypot(q.x - p.x, q.z - p.z) < LEADER_RADIUS;
      q.resolve -= q.maxResolve * (near ? 0.45 : 0.18);
    }
    this.events.push({ type: 'leaderDown', x: p.x, z: p.z, how, left: this.leadersLeft });
  }

  /** Paliza: el agente agarra al más cercano y lo deja tirado; luego huirá. Escandaliza y enfurece. */
  private beat(u: Unit, def: UnitDef): void {
    const reach = def.halfLength + def.pushRadius + def.radius;
    let target: Protester | null = null;
    let bestD = reach;
    this.grid.query(u.x, u.z, reach, this.near2);
    for (const i of this.near2) {
      const p = this.protesters[i];
      if (!isUpright(p) || p.state === 'fleeing' || p.kind === 'prensa') continue;
      const d = Math.hypot(p.x - u.x, p.z - u.z);
      if (d < bestD) {
        bestD = d;
        target = p;
      }
    }
    u.cooldown = this.rng.range(4, 7);
    if (!target) return;
    // Lo agarra y lo tumba delante: la paliza dura BEAT_TIME y se ven los golpes.
    this.injure(target, 99);
    u.beatId = target.id;
    u.beatTimer = BEAT_TIME;
    u.cooldown += BEAT_TIME;
    this.addAnger(0.006, 'palizas');
    this.harshness += 0.4;
    this.notePressIfNear(target.x, target.z);
  }

  /**
   * Paliza en curso: el agente se detiene, mantiene al manifestante en el suelo delante de él y
   * le golpea (porra o escudo) cada BEAT_STRIKE s. Al terminar, el herido se levanta y huye.
   * Devuelve true mientras dura (la tropa no hace otra cosa).
   */
  private holdBeating(u: Unit, def: UnitDef, dt: number): boolean {
    if (u.beatId === null) return false;
    const p = this.protesters[u.beatId];
    if (!p || p.state !== 'injured' || !this.active(u)) {
      this.releaseBeaten(u);
      return false;
    }
    const before = u.beatTimer;
    u.beatTimer -= dt;
    u.targetX = u.x;
    u.targetZ = u.z;
    const reach = def.radius + 0.55;
    p.x = u.x + Math.sin(u.heading) * reach;
    p.z = u.z + Math.cos(u.heading) * reach;
    if (Math.floor(before / BEAT_STRIKE) !== Math.floor(u.beatTimer / BEAT_STRIKE)) {
      this.events.push({ type: 'beating', x: p.x, z: p.z });
    }
    if (u.beatTimer <= 0) {
      this.releaseBeaten(u);
      return false;
    }
    return true;
  }

  /** Suelta al apaleado: queda en el suelo un momento y luego huye. */
  private releaseBeaten(u: Unit): void {
    if (u.beatId === null) return;
    const p = this.protesters[u.beatId];
    if (p && p.state === 'injured') p.downTimer = 3;
    u.beatId = null;
    u.beatTimer = 0;
  }

  /** Mano dura: toda la policía saca la pistola (sin mejora). */
  private pistol(u: Unit, cooldown: number): void {
    if (this.forceLevel >= FORCE_GATES.lethal && this.active(u)) this.fireLive(u, 10, cooldown, 0.35, 'police');
  }

  /** Fuego real. Devuelve true si disparó. */
  private fireLive(u: Unit, range: number, cooldown: number, killChance: number, by: 'army' | 'police'): boolean {
    if (u.fireCd > 0) return false;
    const target = this.nearestProtester(u.x, u.z, range, 1.5, true);
    if (!target) return false;
    u.fireCd = cooldown * this.rng.range(0.8, 1.2);
    if (isIdle(u)) u.heading = Math.atan2(target.x - u.x, target.z - u.z);
    if (!this.openedFire[by]) {
      this.openedFire[by] = true;
      this.events.push({ type: 'openFire', by });
    }
    this.harshness += 0.5;
    let result: ShotResult = 'miss';
    if (this.rng.chance(0.75)) {
      result = this.rng.chance(killChance) ? 'kill' : 'injure';
      if (result === 'kill') this.kill(target);
      else this.injure(target, 8);
    }
    this.events.push({ type: 'liveShot', fromX: u.x, fromZ: u.z, toX: target.x, toZ: target.z, result });
    this.notePressIfNear(target.x, target.z, result === 'kill' ? 2 : 1);
    return true;
  }

  private kill(p: Protester): void {
    p.state = 'dead';
    p.vx = 0;
    p.vz = 0;
    this.deaths++;
    this.events.push({ type: 'killed', x: p.x, z: p.z, kind: p.kind });
    // Terror alrededor... y furia en toda la plaza.
    this.addAnger(0.025, 'muertes');
    this.grid.query(p.x, p.z, 6, this.near2);
    for (const i of this.near2) {
      const q = this.protesters[i];
      if (q !== p && isUpright(q) && q.state !== 'fleeing') q.resolve -= this.stage >= 3 ? 0.1 : 0.35;
    }
    if (p.kind === 'lider') {
      this.leadersKilled++;
      this.addAnger(0.05, 'muertes');
      this.events.push({ type: 'martyr', x: p.x, z: p.z });
      this.leaderDown(p, 'killed');
    }
  }

  private injure(p: Protester, seconds: number): void {
    p.state = 'injured';
    p.downTimer = seconds;
    p.vx = 0;
    p.vz = 0;
    this.injuredCount++;
  }

  private spray(u: Unit, def: UnitDef, dt: number): void {
    u.sprayTarget = null;
    if (u.water <= 0) return;
    // Primero apaga el fuego que tenga a tiro (a cualquier nivel de fuerza: no es usar la fuerza).
    const range = def.sprayRange ?? 0;
    const fire = this.fires.find((f) => f.life > 0 && Math.hypot(f.x - u.x, f.z - u.z) <= range + f.r);
    if (fire) {
      u.sprayTarget = { x: fire.x, z: fire.z };
      u.water = Math.max(0, u.water - dt);
      if (isIdle(u)) turnToward(u, fire.x, fire.z, dt * 2);
      fire.life -= dt * 4; // unos 3 s de chorro por caucho
      if (fire.life <= 0) this.events.push({ type: 'extinguish', x: fire.x, z: fire.z });
      if ((this.stepCount + u.id) % 2 === 0) {
        this.events.push({ type: 'spray', fromX: u.x + Math.sin(u.heading) * 1.4, fromZ: u.z + Math.cos(u.heading) * 1.4, toX: fire.x, toZ: fire.z });
      }
      return;
    }
    if (this.forceLevel < FORCE_GATES.gas) return;
    const target = this.nearestProtester(u.x, u.z, def.sprayRange ?? 0, 1.5);
    if (!target) return;

    this.sprayingNow++;
    u.sprayTarget = { x: target.x, z: target.z };
    u.water = Math.max(0, u.water - dt);
    if (isIdle(u)) turnToward(u, target.x, target.z, dt * 2);

    const resist = 1 - this.anger * 0.5;
    const power = Math.sqrt(FORCE_LEVELS[this.forceLevel].dispersalMult) * this.nightFactor(u);
    this.grid.query(target.x, target.z, SPRAY_SPLASH, this.near);
    for (const i of this.near) {
      const p = this.protesters[i];
      if (!isUpright(p) || p.state === 'fleeing') continue;
      if (Math.hypot(p.x - target.x, p.z - target.z) > SPRAY_SPLASH) continue;
      const dx = p.x - u.x;
      const dz = p.z - u.z;
      const dist = Math.hypot(dx, dz) || 1;
      const shieldF = p.kind === 'escudero' ? 0.5 : 1;
      p.resolve -= 0.75 * dt * power * resist * this.loyaltyFactor * shieldF;
      p.x += (dx / dist) * 3.5 * dt;
      p.z += (dz / dist) * 3.5 * dt;
    }

    if ((this.stepCount + u.id) % 2 === 0) {
      this.events.push({
        type: 'spray',
        fromX: u.x + Math.sin(u.heading) * 1.4,
        fromZ: u.z + Math.cos(u.heading) * 1.4,
        toX: target.x,
        toZ: target.z,
      });
    }
    if (this.stepCount % 30 === 0) this.notePressIfNear(target.x, target.z);
  }

  private launchGas(u: Unit, def: UnitDef, tx: number, tz: number, salvo: boolean): void {
    u.ammo -= 1;
    u.cooldown = def.cooldown ?? 4;
    if (isIdle(u)) u.heading = Math.atan2(tx - u.x, tz - u.z);
    const points = [{ x: tx, z: tz }];
    if (salvo) {
      const dx = tx - u.x;
      const dz = tz - u.z;
      const d = Math.hypot(dx, dz) || 1;
      points.push({ x: tx - (dz / d) * 4.5, z: tz + (dx / d) * 4.5 });
      points.push({ x: tx + (dz / d) * 4.5, z: tz - (dx / d) * 4.5 });
    }
    for (const p of points) this.addCloud(u.x, u.z, p.x, p.z, salvo ? GAS_RADIUS * 1.2 : GAS_RADIUS, def.gasLife ?? GAS_LIFE);
  }

  private addCloud(fromX: number, fromZ: number, x: number, z: number, r: number, life = GAS_LIFE): void {
    this.gasClouds.push({ x, z, r, life, maxLife: life });
    this.events.push({ type: 'gas', fromX, fromZ, toX: x, toZ: z });
    this.harshness += 1;
    this.addAnger(0.01, 'gas');
    this.notePressIfNear(x, z);
  }

  private shootRubber(u: Unit, def: UnitDef): void {
    const target = this.nearestProtester(u.x, u.z, def.range ?? 11, 1);
    if (!target) return;
    u.ammo -= 1;
    u.cooldown = def.cooldown ?? 1.2;
    if (isIdle(u)) u.heading = Math.atan2(target.x - u.x, target.z - u.z);
    const shieldF = target.kind === 'escudero' ? 0.4 : 1;
    target.resolve -= 0.55 * shieldF;
    const injured = target.kind !== 'escudero' && this.rng.chance(0.12);
    if (injured) this.injure(target, 5);
    this.grid.query(target.x, target.z, 1.6, this.near2);
    for (const i of this.near2) {
      const p = this.protesters[i];
      if (p === target || !isUpright(p) || p.state === 'fleeing') continue;
      if (Math.hypot(p.x - target.x, p.z - target.z) <= 1.6) p.resolve -= p.kind === 'escudero' ? 0.08 : 0.2;
    }
    this.addAnger(0.004, 'perdigones');
    this.harshness += 0.3;
    this.events.push({ type: 'shot', fromX: u.x, fromZ: u.z, toX: target.x, toZ: target.z, injured });
    this.notePressIfNear(target.x, target.z);
  }

  /**
   * Motorizados: agresivos y por su cuenta, a cualquier nivel de fuerza. Embisten al líder marcado
   * o al grupo más denso, agarran a alguien (siempre a un líder) y lo arrastran hasta su base: detenido.
   */
  private motoCharge(u: Unit, def: UnitDef): void {
    if (!this.active(u)) {
      this.dropCarried(u);
      return;
    }
    this.grid.query(u.x, u.z, 6, this.near);
    for (const i of this.near) {
      const p = this.protesters[i];
      if (p.state === 'fleeing' && Math.hypot(p.x - u.x, p.z - u.z) < 6) p.chased = true;
    }

    // Lo lleva montado en la moto (entre los dos agentes) hasta la puerta del palacio: allí queda detenido.
    if (u.carryId !== null) {
      const p = this.protesters[u.carryId];
      if (!p || p.state !== 'injured') {
        u.carryId = null;
      } else {
        p.x = u.x;
        p.z = u.z;
        p.downTimer = 5;
        const gateX = clamp(u.homeX, -5, 5);
        u.targetX = gateX;
        u.targetZ = MOTO_JAIL_Z;
        if (Math.hypot(u.x - gateX, u.z - MOTO_JAIL_Z) < 1.2) {
          p.state = 'gone';
          u.carryId = null;
          u.cooldown = 2.5;
          this.arrests++;
          this.addAnger(0.015, 'arrestos');
          this.events.push({ type: 'arrest', x: p.x, z: p.z });
          this.notePressIfNear(p.x, p.z);
          if (p.kind === 'lider') this.leaderDown(p, 'arrest');
          u.targetX = u.homeX; // y vuelve a su puesto
          u.targetZ = u.homeZ;
        }
        return;
      }
    }

    if (u.chargeTo) {
      u.targetX = u.chargeTo.x;
      u.targetZ = u.chargeTo.z;
      // Al atravesar el grupo, agarra a alguien: siempre a un líder, a veces a cualquiera.
      const grab = this.protesterAt(u.x, u.z, 1.4, (p) => p.kind !== 'prensa' && p.state !== 'gathering');
      if (grab && (grab.kind === 'lider' || this.rng.chance(0.3))) {
        grab.state = 'injured';
        grab.downTimer = 5;
        u.carryId = grab.id;
        u.chargeTo = null;
        return;
      }
      if (Math.hypot(u.chargeTo.x - u.x, u.chargeTo.z - u.z) < 0.6) {
        u.chargeTo = null;
        u.targetX = u.homeX;
        u.targetZ = u.homeZ;
        u.cooldown = 2.5;
      }
      return;
    }
    if (u.cooldown > 0 || Math.hypot(u.x - u.homeX, u.z - u.homeZ) > 1) return;
    const leader = this.protesterAt(u.homeX, u.homeZ, 20, (p) => p.marked > 0 && p.state !== 'gathering')
      ?? this.protesterAt(u.homeX, u.homeZ, 12, (p) => p.kind === 'lider' && p.state !== 'gathering');
    const spot = leader ? { x: leader.x, z: leader.z } : this.densestPoint(u.homeX, u.homeZ, 16, 0);
    if (!spot || (!leader && (spot as { count: number }).count < 3)) return;
    const dx = spot.x - u.x;
    const dz = spot.z - u.z;
    const d = Math.hypot(dx, dz) || 1;
    u.chargeTo = { x: clamp(spot.x + (dx / d) * 3, -32, 32), z: clamp(spot.z + (dz / d) * 3, -20, 34) };
    this.events.push({ type: 'charge', x: spot.x, z: spot.z });
    void def;
  }

  /** Suelta a quien llevaba arrastrando (la moto se retira o cae). */
  private dropCarried(u: Unit): void {
    if (u.carryId === null) return;
    const p = this.protesters[u.carryId];
    if (p && p.state === 'injured') p.downTimer = 1.5;
    u.carryId = null;
  }

  /**
   * Equipo de captura: defiende su posición. Sale solo a por líderes cercanos y poco protegidos
   * (o marcados por el helicóptero), o a por el que le ordenes. Aborta si se pone feo.
   */
  private capture(u: Unit, def: UnitDef): void {
    if (!this.active(u)) return;
    if (u.chaseId !== null) {
      const leader = this.protesters[u.chaseId];
      const lost = !leader || (leader.state !== 'advancing' && leader.state !== 'occupying' && leader.state !== 'gathering');
      const tooHot = u.integrity < u.maxIntegrity * 0.5 || (!u.manualChase && this.crowdAround(u.x, u.z, 3) > 10);
      if (lost || tooHot) {
        u.chaseId = null;
        u.manualChase = false;
        u.targetX = u.homeX;
        u.targetZ = u.homeZ;
        u.cooldown = tooHot ? 5 : 1;
        return;
      }
      u.targetX = clamp(leader.x, -32, 32);
      u.targetZ = clamp(leader.z, -20, 34);
      if (Math.hypot(leader.x - u.x, leader.z - u.z) < 1.4) {
        leader.state = 'gone';
        this.arrests++;
        this.addAnger(leader.kind === 'lider' ? 0.02 : 0.01, 'arrestos');
        this.events.push({ type: 'arrest', x: leader.x, z: leader.z });
        this.notePressIfNear(leader.x, leader.z);
        // Los de alrededor se desaniman; si era un líder, toda la plaza.
        if (leader.kind === 'lider') {
          this.leaderDown(leader, 'arrest');
        } else {
          this.grid.query(leader.x, leader.z, LEADER_RADIUS, this.near2);
          for (const i of this.near2) {
            const q = this.protesters[i];
            if (isUpright(q) && q.state !== 'fleeing') q.resolve -= 0.06;
          }
        }
        u.chaseId = null;
        u.manualChase = false;
        u.cooldown = 3;
        u.targetX = u.homeX;
        u.targetZ = u.homeZ;
      }
      return;
    }
    if (u.cooldown > 0) return;
    // Busca activamente: líderes marcados > líderes > radicales y armados > cualquiera (nunca la prensa).
    let best: Protester | null = null;
    let bestScore = Infinity;
    for (const p of this.protesters) {
      if (p.kind === 'prensa' || (p.state !== 'advancing' && p.state !== 'occupying')) continue;
      const marked = p.marked > 0;
      const d = Math.hypot(p.x - u.homeX, p.z - u.homeZ);
      if (d > (marked ? 18 : (def.range ?? 12))) continue;
      if (!marked && this.crowdAround(p.x, p.z, 3) >= 8) continue; // demasiado protegido
      const priority = marked ? 0 : p.kind === 'lider' ? 3 : p.kind === 'radical' || p.weapon !== 'none' ? 6 : 9;
      const score = d + priority;
      if (score < bestScore) {
        bestScore = score;
        best = p;
      }
    }
    if (best) u.chaseId = best.id;
  }

  private negotiate(u: Unit, def: UnitDef, dt: number): void {
    u.talking = false;
    if (this.forceLevel >= 2 || !this.active(u)) return; // nadie negocia bajo perdigones
    const range = def.range ?? 8;
    this.grid.query(u.x, u.z, range, this.near);
    let listeners = 0;
    let nearest: Protester | null = null;
    let nearestD = Infinity;
    for (const i of this.near) {
      const p = this.protesters[i];
      const d = Math.hypot(p.x - u.x, p.z - u.z);
      if (!isUpright(p) || p.state === 'fleeing' || d > range) continue;
      listeners++;
      if (d < nearestD) {
        nearestD = d;
        nearest = p;
      }
      p.resolve -= 0.04 * dt;
    }
    u.talking = listeners > 0;
    if (nearest && isIdle(u)) turnToward(u, nearest.x, nearest.z, dt * 3); // habla de cara a la multitud
    if (listeners >= 3) this.anger = Math.max(this.angerFloor * 0.5, this.anger - 0.0025 * dt * this.fx.calmMult);
  }

  /** Con lealtad baja, el ejército puede negarse a actuar o desertar y unirse a la multitud. */
  private armyLoyaltyCheck(u: Unit, dt: number): void {
    if (this.loyalty >= 45 || u.refusing > 0) return;
    if (this.loyalty < 25 && this.rng.chance(dt * 0.03)) {
      u.integrity = 0;
      this.deserterIds.add(u.id);
      this.deserted++;
      this.events.push({ type: 'desert', x: u.x, z: u.z });
      for (let i = 0; i < 3; i++) {
        this.spawnOne('sur', u.x + this.rng.range(-1, 1), u.z + this.rng.range(-1, 1), 'advancing');
        const p = this.protesters[this.protesters.length - 1];
        if (this.pressIds[this.pressIds.length - 1] === p.id) this.pressIds.pop();
        p.kind = 'pacifico';
        p.weapon = 'none';
      }
      return;
    }
    if (this.rng.chance(dt * ((45 - this.loyalty) / 100) * 0.12)) {
      u.refusing = 10;
      this.events.push({ type: 'refuse', x: u.x, z: u.z });
    }
  }

  private updateGas(dt: number): void {
    const resist = 1 - this.anger * 0.5;
    for (let c = this.gasClouds.length - 1; c >= 0; c--) {
      const g = this.gasClouds[c];
      g.life -= dt * (this.rain ? 1.5 : 1); // la lluvia lava el gas
      if (g.life <= 0) {
        this.gasClouds.splice(c, 1);
        continue;
      }
      g.x += this.wind.x * dt;
      g.z += this.wind.z * dt;
      const strength = 0.4 + 0.6 * (g.life / g.maxLife);
      this.grid.query(g.x, g.z, g.r, this.near);
      for (const i of this.near) {
        const p = this.protesters[i];
        if (!isUpright(p) || p.state === 'fleeing') continue;
        const d = Math.hypot(p.x - g.x, p.z - g.z);
        if (d > g.r) continue;
        const maskF = p.masked ? 0.4 : 1;
        const shieldF = p.kind === 'escudero' ? 0.7 : 1;
        p.resolve -= 0.32 * dt * resist * maskF * shieldF * strength * this.loyaltyFactor;
      }
      if (!this.fx.gasImmune) {
        for (const u of this.units) {
          if (!UNITS[u.type].infantry || Math.hypot(u.x - g.x, u.z - g.z) > g.r) continue;
          this.hurt(u, 1.2 * dt);
        }
      }
    }
  }

  private updateFires(dt: number): void {
    for (let i = this.fires.length - 1; i >= 0; i--) {
      const f = this.fires[i];
      f.life -= dt * (this.rain ? 2 : 1); // y apaga el fuego
      if (f.life <= 0) {
        this.fires.splice(i, 1);
        continue;
      }
      for (const u of this.units) {
        if (UNITS[u.type].flying) continue;
        if (Math.hypot(u.x - f.x, u.z - f.z) >= f.r + UNITS[u.type].radius) continue;
        // Un vehículo que pasa por encima aplasta el fuego (y no se quema).
        if (isVehicle(u.type)) {
          f.life = 0;
          this.events.push({ type: 'extinguish', x: f.x, z: f.z });
          break;
        }
        this.hurt(u, 10 * dt * this.fx.projectileDamageMult * this.fx.bruiseMult[u.type], true);
      }
    }
  }

  // ─── Manifestantes ─────────────────────────────────────────────────────

  private protesterActions(dt: number): void {
    for (const leader of this.protesters) {
      if (leader.kind !== 'lider' || (leader.state !== 'advancing' && leader.state !== 'occupying')) continue;
      this.grid.query(leader.x, leader.z, LEADER_RADIUS, this.near);
      for (const i of this.near) {
        const p = this.protesters[i];
        if (!isUpright(p) || p.state === 'fleeing') continue;
        p.resolve = Math.min(p.maxResolve, p.resolve + 0.05 * dt);
      }
    }

    const palaceMult = CROWD_STAGES[this.stage].palaceMult;
    let occupiers = 0;
    for (const p of this.protesters) {
      if (p.state === 'gone' || p.state === 'dead') continue;
      p.throwCd -= dt;
      p.marked = Math.max(0, p.marked - dt);

      if (p.state === 'injured') {
        p.downTimer -= dt;
        if (p.downTimer <= 0) {
          p.state = 'fleeing';
          p.fleeTo = nearestExit(p.x, p.z);
        }
        continue;
      }

      if (p.state === 'fleeing') {
        if (isOutside(p.x, p.z)) {
          p.state = 'gone';
          this.dispersed++;
        }
        continue;
      }

      if (p.resolve <= 0) {
        p.state = 'fleeing';
        p.fleeTo = nearestExit(p.x, p.z);
        this.events.push({ type: 'disperse', x: p.x, z: p.z });
        continue;
      }

      if (p.state === 'gathering') continue;

      if (p.state === 'occupying' && p.kind !== 'prensa' && p.kind !== 'medico') {
        occupiers++;
        this.palaceHp -= 0.1 * dt * (p.kind === 'radical' ? 2 : 1) * (1 + this.anger) * palaceMult;
      }
      if (p.kind === 'medico') this.rescue(p);
      else if (p.kind !== 'prensa') this.useWeapon(p);
      this.maybeBurnTire(p, dt);
    }
    if (occupiers === 0 && this.palaceHp > 0 && this.palaceHp < 100) this.palaceHp = Math.min(100, this.palaceHp + 0.5 * dt);
  }

  /** Brigadas médicas: levantan a los heridos y recuperan a los que huyen (salvo si los persiguen motorizados). */
  private rescue(medic: Protester): void {
    if (medic.throwCd > 0) return;
    medic.throwCd = 3;
    let best: Protester | null = null;
    let bestScore = Infinity;
    this.grid.query(medic.x, medic.z, 6, this.near);
    for (const i of this.near) {
      const p = this.protesters[i];
      const d = Math.hypot(p.x - medic.x, p.z - medic.z);
      if (d > 6) continue;
      const score = p.state === 'injured' ? d : p.state === 'fleeing' && !p.chased ? d + 10 : Infinity;
      if (score < bestScore) {
        bestScore = score;
        best = p;
      }
    }
    if (!best) return;
    best.state = 'advancing';
    best.resolve = best.maxResolve * 0.5;
    best.downTimer = 0;
    this.events.push({ type: 'rescue', x: best.x, z: best.z });
  }

  private useWeapon(p: Protester): void {
    const gun = p.weapon === 'arma' && this.stage >= 3;
    const molotov = p.weapon === 'molotov' && this.stage >= 3;
    const rock = this.stage >= 1 && (p.weapon === 'piedra' || ((p.weapon === 'molotov' || p.weapon === 'arma') && !molotov && !gun));
    if (!gun && !molotov && !rock) return;
    if (p.throwCd > 0) return;

    const target = this.projectileTarget(p.x, p.z, gun ? GUN_RANGE : molotov ? MOLOTOV_RANGE : THROW_RANGE);
    if (!target) {
      p.throwCd = 0.6;
      return;
    }
    const dmg = this.fx.projectileDamageMult;
    if (gun) {
      this.hurt(target, 14 * (target.type === 'tanqueta' ? 0.3 : 1), true);
      this.events.push({ type: 'gunshot', fromX: p.x, fromZ: p.z, toX: target.x, toZ: target.z });
      p.throwCd = this.rng.range(3, 5);
    } else if (molotov) {
      this.hurt(target, 6 * dmg, true);
      this.fires.push({ kind: 'molotov', x: target.x, z: target.z, r: 2.2, life: 5 });
      this.events.push({ type: 'molotov', fromX: p.x, fromZ: p.z, toX: target.x, toZ: target.z });
      p.throwCd = this.rng.range(6, 9);
    } else {
      this.hurt(target, (3 + 3 * this.anger) * dmg);
      this.events.push({ type: 'throw', fromX: p.x, fromZ: p.z, toX: target.x, toZ: target.z });
      p.throwCd = this.rng.range(2, 4) * (1.3 - this.anger * 0.7);
    }
  }

  /** Las tanquetas atraen piedras, bombas y disparos: protegen a la infantería. */
  private projectileTarget(x: number, z: number, range: number): Unit | null {
    for (const u of this.units) {
      if (u.type === 'tanqueta' && Math.hypot(u.x - x, u.z - z) < Math.max(range, TANQUETA_MAGNET)) return u;
    }
    return this.nearestUnit(x, z, range);
  }

  private maybeBurnTire(p: Protester, dt: number): void {
    if (!this.def.burnsTires || p.kind !== 'radical' || this.stage < 1 || p.state !== 'advancing') return;
    if (this.rain && this.rng.chance(0.5)) return; // con lluvia cuesta prender cauchos
    if (this.fires.filter((f) => f.kind === 'tire').length >= 8 || !this.rng.chance(dt * 0.025 * this.stage)) return;
    if (p.z > 30 || p.z < -12) return;
    this.fires.push({ kind: 'tire', x: p.x, z: p.z, r: 1.6, life: 12 });
    this.events.push({ type: 'tire', x: p.x, z: p.z });
  }

  /** Si la fuerza se usa cerca de la prensa, el mundo entero se entera. */
  private notePressIfNear(x: number, z: number, weight = 1): void {
    for (const id of this.pressIds) {
      const p = this.protesters[id];
      if (!isUpright(p) || p.throwCd > 0) continue;
      if (Math.hypot(p.x - x, p.z - z) > PRESS_RADIUS) continue;
      p.throwCd = 8;
      this.pressIncidents += weight;
      this.events.push({ type: 'press', x: p.x, z: p.z });
      return;
    }
  }

  private removeBrokenUnits(): void {
    for (let i = this.units.length - 1; i >= 0; i--) {
      const u = this.units[i];
      if (u.integrity > 0) continue;
      this.dropCarried(u);
      this.releaseBeaten(u);
      this.units.splice(i, 1);
      if (this.deserterIds.has(u.id)) continue;
      this.brokenUnits++;
      if (UNITS[u.type].infantry && u.lastLethal) {
        this.soldiersKilled++;
        this.bodies.push({ type: u.type, x: u.x, z: u.z, heading: u.heading });
        this.events.push({ type: 'soldierDown', unitType: u.type, x: u.x, z: u.z });
      } else {
        this.events.push({ type: 'unitBroken', unitType: u.type, x: u.x, z: u.z });
      }
    }
  }

  /** Pierdes si el palacio cae. Ganas si resiste hasta el final o despejas la plaza. */
  private checkEnd(): void {
    if (this.palaceHp <= 0) {
      this.palaceFallen = true;
      this.events.push({ type: 'palaceFallen' });
      this.finish(false, 'palace');
    } else if (this.marchStarted && this.spawned >= this.total && this.activeCount === 0) {
      this.finish(true, 'cleared');
    } else if (this.elapsed >= this.duration) {
      this.finish(true, 'time');
    }
  }

  private finish(won: boolean, reason: RiotResult['reason']): void {
    const fleeing = this.protesters.filter((p) => p.state === 'fleeing' || p.state === 'injured').length;
    this.palaceHp = Math.max(0, this.palaceHp);
    this.result = {
      won,
      reason,
      total: this.total,
      angerSources: { ...this.angerSources },
      objective: this.objective ?? undefined,
      objectiveDone: this.objective !== null && won && OBJECTIVES[this.objective].status(this.objectiveStats).done,
      demand: this.demand ? { ...this.demand } : undefined,
      leadersDown: this.leadersDown,
      vehiclesUsed: this.vehiclesUsed,
      colectivosUsed: this.colectivosUsed,
      survivors: this.units.reduce<Partial<Record<UnitType, number>>>((acc, u) => {
        acc[u.type] = (acc[u.type] ?? 0) + 1;
        return acc;
      }, {}),
      dispersed: this.dispersed + fleeing,
      elapsed: this.elapsed,
      avgForce: this.forceIntegral / Math.max(this.elapsed, 1),
      tanquetas: this.tanquetasDeployed,
      brokenUnits: this.brokenUnits,
      palaceHp: this.palaceHp,
      peakStage: this.peakStage,
      finalAnger: this.anger,
      arrests: this.arrests,
      pressIncidents: this.pressIncidents,
      armyDeployed: this.armyDeployed,
      deserted: this.deserted,
      harshness: this.harshness,
      palaceFallen: this.palaceFallen,
      occupiedSeconds: 0,
      deaths: this.deaths,
      injured: this.injuredCount,
      leadersKilled: this.leadersKilled,
      soldiersKilled: this.soldiersKilled,
      tanquetaSeconds: this.tanquetaSeconds,
    };
  }

  // ─── Utilidades ────────────────────────────────────────────────────────

  private crowdAround(x: number, z: number, r: number): number {
    let n = 0;
    this.grid.query(x, z, r, this.near2);
    for (const i of this.near2) {
      const p = this.protesters[i];
      if (isUpright(p) && p.state !== 'fleeing' && Math.hypot(p.x - x, p.z - z) <= r) n++;
    }
    return n;
  }

  /** Punto con más manifestantes juntos dentro del alcance (para salvas de gas y embestidas). */
  private densestPoint(x: number, z: number, range: number, minDist: number): { x: number; z: number; count: number } | null {
    const candidates: Protester[] = [];
    this.grid.query(x, z, range, this.near);
    for (const i of this.near) {
      const p = this.protesters[i];
      if (!isUpright(p) || p.state === 'fleeing' || p.kind === 'prensa') continue;
      const d = Math.hypot(p.x - x, p.z - z);
      if (d <= range && d >= minDist) candidates.push(p);
    }
    if (candidates.length === 0) return null;
    const step = Math.max(1, Math.floor(candidates.length / 25));
    let best = { x: candidates[0].x, z: candidates[0].z, count: 0 };
    for (let i = 0; i < candidates.length; i += step) {
      const c = candidates[i];
      const count = this.crowdAround(c.x, c.z, 3);
      if (count > best.count) best = { x: c.x, z: c.z, count };
    }
    return best;
  }

  private nearestProtester(x: number, z: number, range: number, minDist: number, includePress = false): Protester | null {
    let best: Protester | null = null;
    let bestD = range;
    this.grid.query(x, z, range, this.near2);
    for (const i of this.near2) {
      const p = this.protesters[i];
      if (!isUpright(p) || p.state === 'fleeing' || (p.kind === 'prensa' && !includePress)) continue;
      const d = Math.hypot(p.x - x, p.z - z);
      if (d < bestD && d >= minDist) {
        bestD = d;
        best = p;
      }
    }
    return best;
  }

  private nearestUnit(x: number, z: number, range: number): Unit | null {
    let best: Unit | null = null;
    let bestD = range;
    for (const u of this.units) {
      if (UNITS[u.type].flying || u.hidden) continue;
      const d = Math.hypot(u.x - x, u.z - z);
      if (d < bestD) {
        bestD = d;
        best = u;
      }
    }
    return best;
  }
}

/** De pie y en la plaza (no herido, muerto ni ido). */
function isUpright(p: Protester): boolean {
  return p.state !== 'gone' && p.state !== 'dead' && p.state !== 'injured';
}

function isIdle(u: Unit): boolean {
  return Math.hypot(u.targetX - u.x, u.targetZ - u.z) <= 0.05;
}

function segmentAxis(u: Unit, def: UnitDef): [number, number] {
  const s = Math.sin(u.heading);
  const c = Math.cos(u.heading);
  return def.axis === 'z' ? [s, c] : [c, -s];
}

function turnToward(u: Unit, x: number, z: number, maxStep: number): void {
  const desired = Math.atan2(x - u.x, z - u.z);
  let diff = desired - u.heading;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  u.heading += clamp(diff, -maxStep, maxStep);
}
