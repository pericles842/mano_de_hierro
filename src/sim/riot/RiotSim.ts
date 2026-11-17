import { Random } from '../../core/Random';
import { CROWD_STAGES, STAGE_HYSTERESIS, stageForAnger, type CrowdStage } from '../../data/crowdStages';
import { FORCE_LEVELS } from '../../data/forceLevels';
import type { RiotDef, SpawnId } from '../../data/riots';
import { UNITS, type UnitDef, type UnitType } from '../../data/units';
import { upgradeEffects, type UpgradeEffects, type UpgradeId } from '../../data/upgrades';
import { SpatialGrid } from '../spatialGrid';
import {
  GOAL_Z,
  PALACE,
  PROTESTER_RADIUS,
  SPAWNS,
  clamp,
  constrain,
  exitPoint,
  isDeployable,
  isOutside,
  nearestExit,
} from './map';
import type { FireZone, Protester, ProtesterKind, RiotEvent, RiotResult, Unit, Weapon } from './types';

export interface RiotConfig {
  def: RiotDef;
  /** Multiplicador del tamaño de la multitud (crece con los días). */
  scale: number;
  stock: Record<UnitType, number>;
  loyalty: number;
  /** Molestia social del país (0..100): sube la ira inicial. */
  unrest: number;
  seed: number;
  upgrades?: readonly UpgradeId[];
}

/** Segundos de concentración antes de que arranque la marcha (tiempo para colocar barricadas). */
export const PREP_TIME = 15;
const INITIAL_SHARE = 0.35;
const SEPARATION_DIST = 0.8;
const LEADER_RADIUS = 6;
const THROW_RANGE = 9;
const MOLOTOV_RANGE = 11;
const SPRAY_SPLASH = 3.2;
const WEAPON_RANK: Record<Weapon, number> = { none: 0, piedra: 1, palo: 2, molotov: 3 };

/**
 * Simulación de una revuelta. TypeScript puro: no conoce Three.js ni el DOM,
 * así que se puede probar con tests y ejecutar sin navegador.
 */
export class RiotSim {
  readonly def: RiotDef;
  readonly protesters: Protester[] = [];
  readonly units: Unit[] = [];
  readonly fires: FireZone[] = [];
  readonly available: Record<UnitType, number>;
  readonly total: number;
  readonly duration: number;

  /** Eventos del último paso (para efectos visuales y sonido). */
  events: RiotEvent[] = [];
  forceLevel = 0;
  elapsed = 0;
  palaceHp = 100;
  anger: number;
  stage: CrowdStage;
  peakStage: CrowdStage;
  /** La multitud está detenida cantando consignas (fases tranquilas). */
  chanting = false;
  marchStarted = false;
  dispersed = 0;
  spawned = 0;
  brokenUnits = 0;
  tanquetasDeployed = 0;
  result: RiotResult | null = null;

  private readonly rng: Random;
  private readonly grid = new SpatialGrid(2, -52, -26, 52, 40);
  private readonly near: number[] = [];
  private readonly loyaltyFactor: number;
  private readonly fx: UpgradeEffects;
  private readonly angerFloor: number;
  private readonly spawnDeadline: number;
  private forceIntegral = 0;
  private nextWaveIn = PREP_TIME + 3;
  private pulseTimer = 0;
  private leadersSpawned = 0;
  private nextUnitId = 1;
  private stepCount = 0;
  private sprayingNow = 0;

  constructor(cfg: RiotConfig) {
    this.def = cfg.def;
    this.rng = new Random(cfg.seed);
    this.total = Math.round(cfg.def.protesters * cfg.scale);
    this.duration = cfg.def.duration;
    this.spawnDeadline = this.duration * 0.65;
    this.available = { ...cfg.stock };
    this.anger = initialAnger(cfg.def, cfg.unrest);
    this.angerFloor = cfg.def.aggression * 0.4;
    this.stage = stageForAnger(this.anger);
    this.peakStage = this.stage;
    this.loyaltyFactor = cfg.def.loyaltySensitive && cfg.loyalty < 50 ? 0.65 : 1;
    this.fx = upgradeEffects(cfg.upgrades ?? []);

    // Concentración inicial: una parte de la multitud espera en las calles de acceso.
    const initial = Math.round(this.total * INITIAL_SHARE);
    for (let i = 0; i < initial; i++) {
      const spawnId = this.def.spawns[i % this.def.spawns.length];
      const area = SPAWNS[spawnId];
      this.spawnOne(spawnId, this.rng.range(area.x[0], area.x[1]), this.rng.range(area.z[0], area.z[1]), 'gathering');
    }
  }

  /** Manifestantes que siguen protestando (no huyen ni se han ido). */
  get activeCount(): number {
    let n = 0;
    for (const p of this.protesters) {
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

  // ─── Comandos del jugador ──────────────────────────────────────────────

  canDeploy(type: UnitType, x: number, z: number): boolean {
    if (this.result || this.available[type] <= 0 || !isDeployable(x, z)) return false;
    return this.units.every((u) => Math.hypot(u.x - x, u.z - z) >= 1.2);
  }

  deploy(type: UnitType, x: number, z: number, heading = 0): Unit | null {
    if (!this.canDeploy(type, x, z)) return null;
    const def = UNITS[type];
    const integrity = def.integrity * this.fx.integrityMult[type];
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
      sprayTarget: null,
    };
    this.available[type]--;
    if (type === 'tanqueta') this.tanquetasDeployed++;
    this.units.push(unit);
    return unit;
  }

  orderMove(unitId: number, x: number, z: number): boolean {
    const unit = this.units.find((u) => u.id === unitId);
    if (!unit || UNITS[unit.type].speed <= 0) return false;
    unit.targetX = clamp(x, -29, 29);
    unit.targetZ = clamp(z, -20, 29);
    return true;
  }

  setForce(level: number): void {
    this.forceLevel = clamp(Math.round(level), 0, FORCE_LEVELS.length - 1);
  }

  // ─── Paso de simulación ────────────────────────────────────────────────

  step(dt: number): void {
    if (this.result) return;
    this.events = [];
    this.stepCount++;
    this.elapsed += dt;
    this.forceIntegral += this.forceLevel * dt;

    this.updateAnger(dt);
    this.updateStage();
    this.updatePhase(dt);
    this.spawnWaves(dt);
    this.moveUnits(dt);
    this.moveProtesters(dt);
    this.rebuildGrid();
    this.sprayingNow = 0;
    for (const unit of this.units) this.unitInteractions(unit, dt);
    this.updateFires(dt);
    this.protesterActions(dt);
    this.removeBrokenUnits();
    this.checkEnd();
  }

  /** La ira sube con la represión y baja si solo contienes. */
  private updateAnger(dt: number): void {
    let rate = FORCE_LEVELS[this.forceLevel].angerPerSec;
    if (this.forceLevel === 0) rate -= 0.0035 * this.fx.calmMult;
    rate += this.units.filter((u) => u.type === 'tanqueta').length * 0.0015;
    rate += this.sprayingNow * 0.001;
    const next = this.anger + rate * dt;
    this.anger = rate < 0 ? Math.max(Math.min(this.anger, this.angerFloor), next) : Math.min(1, next);
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
    if (up) for (const p of this.protesters) if (p.state !== 'gone' && p.state !== 'fleeing') this.arm(p);
  }

  private updatePhase(dt: number): void {
    if (!this.marchStarted && this.elapsed >= PREP_TIME) {
      this.marchStarted = true;
      for (const p of this.protesters) if (p.state === 'gathering') p.state = 'advancing';
      this.events.push({ type: 'marchStart' });
    }
    const sd = CROWD_STAGES[this.stage];
    if (this.marchStarted && sd.pause > 0) {
      this.pulseTimer += dt;
      this.chanting = this.pulseTimer % (sd.march + sd.pause) > sd.march;
    } else {
      this.chanting = !this.marchStarted;
    }
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

    const spawnId = this.rng.pick(this.def.spawns);
    const area = SPAWNS[spawnId];
    const cx = this.rng.range(area.x[0], area.x[1]);
    const cz = this.rng.range(area.z[0], area.z[1]);
    for (let i = 0; i < size; i++) {
      this.spawnOne(spawnId, cx + this.rng.range(-3, 3), cz + this.rng.range(-3, 3), 'advancing');
    }
    this.events.push({ type: 'wave', spawn: spawnId, count: size });
  }

  private spawnOne(spawnId: SpawnId, x: number, z: number, state: 'gathering' | 'advancing'): void {
    const remaining = this.total - this.spawned;
    const leadersLeft = this.def.leaders - this.leadersSpawned;
    let kind: ProtesterKind = 'pacifico';
    if (leadersLeft > 0 && this.rng.chance(leadersLeft / remaining)) {
      kind = 'lider';
      this.leadersSpawned++;
    } else if (this.rng.chance(this.def.radicalShare)) {
      kind = 'radical';
    }
    const baseResolve = kind === 'lider' ? 1.6 : kind === 'radical' ? 1.3 : 1;
    const maxResolve = baseResolve * this.def.resolveMult;
    const baseSpeed = kind === 'radical' ? 2.7 : 2.2;
    const p: Protester = {
      id: this.protesters.length,
      kind,
      model: kind === 'radical' ? 3 : kind === 'lider' ? 4 : this.rng.int(0, 2),
      weapon: 'none',
      x,
      z,
      px: x,
      pz: z,
      vx: 0,
      vz: 0,
      homeX: x,
      homeZ: z,
      speed: baseSpeed * this.def.speedMult * this.rng.range(0.85, 1.15),
      resolve: maxResolve,
      maxResolve,
      state,
      targetX: this.rng.range(-PALACE.halfWidth + 1, PALACE.halfWidth - 1),
      fleeTo: spawnId,
      throwCd: this.rng.range(1, 3),
    };
    this.arm(p);
    this.protesters.push(p);
    this.spawned++;
  }

  /** A más ira, más gente armada. Las armas solo mejoran, nunca se pierden. */
  private arm(p: Protester): void {
    if (p.kind === 'lider') return;
    const r = this.rng.next();
    let w: Weapon = 'none';
    if (p.kind === 'radical') {
      if (this.stage >= 3) w = r < 0.5 ? 'molotov' : 'piedra';
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
        const s = Math.min(d, def.speed * dt);
        u.x += (dx / d) * s;
        u.z += (dz / d) * s;
        u.heading = Math.atan2(dx, dz);
      }
    }
  }

  private moveProtesters(dt: number): void {
    const blend = Math.min(1, dt * 4);
    const stageSpeed = CROWD_STAGES[this.stage].speedMult;
    for (const p of this.protesters) {
      if (p.state === 'gone') continue;
      p.px = p.x;
      p.pz = p.z;

      let desX = 0;
      let desZ = 0;
      let target: { x: number; z: number } | null = null;
      let speed = p.speed;
      if (p.state === 'gathering') {
        target = { x: p.homeX, z: p.homeZ };
        speed = Math.hypot(p.homeX - p.x, p.homeZ - p.z) > 1.5 ? 1.2 : 0;
      } else if (p.state === 'advancing' && !this.chanting) {
        target = { x: p.targetX, z: GOAL_Z };
        speed *= stageSpeed;
      } else if (p.state === 'fleeing') {
        target = exitPoint(p.fleeTo, p.x, p.z);
        speed *= 1.7;
      }
      if (target && speed > 0) {
        const dx = target.x - p.x;
        const dz = target.z - p.z;
        const d = Math.hypot(dx, dz) || 1;
        desX = (dx / d) * speed;
        desZ = (dz / d) * speed;
      }

      // Separación: no amontonarse sobre los vecinos (usa la rejilla del paso anterior).
      this.grid.query(p.x, p.z, SEPARATION_DIST, this.near);
      for (const j of this.near) {
        if (j === p.id) continue;
        const q = this.protesters[j];
        if (q.state === 'gone') continue;
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

      if (p.state === 'advancing' && p.z <= GOAL_Z + 0.4 && Math.abs(p.x) <= PALACE.halfWidth) {
        p.state = 'occupying';
      }
    }
  }

  private rebuildGrid(): void {
    this.grid.clear();
    for (const p of this.protesters) if (p.state !== 'gone') this.grid.insert(p.id, p.x, p.z);
  }

  private unitInteractions(u: Unit, dt: number): void {
    const def = UNITS[u.type];
    const force = FORCE_LEVELS[this.forceLevel];
    const resist = 1 - this.anger * 0.5;
    const [ax, az] = segmentAxis(u, def);
    const contactDist = def.radius + PROTESTER_RADIUS;
    const reach = def.halfLength + Math.max(contactDist, def.pushRadius + def.radius, def.fearAura ?? 0) + 0.5;
    let contacts = 0;

    this.grid.query(u.x, u.z, reach, this.near);
    for (const i of this.near) {
      const p = this.protesters[i];
      if (p.state === 'gone') continue;

      // Punto más cercano del segmento de la unidad al manifestante.
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

      // Muros (barricadas, escudos): si alguien cruzó la línea en este paso, vuelve a su lado. Nadie se cuela.
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

      // Colisión: nadie atraviesa a las unidades.
      if (d < contactDist) {
        p.x = cx + nx * contactDist;
        p.z = cz + nz * contactDist;
        p.vx *= 0.5;
        p.vz *= 0.5;
        if (p.state === 'advancing' || p.state === 'occupying') {
          u.integrity -= (p.weapon === 'palo' && this.stage >= 2 ? 4 : 1.2) * dt; // la multitud empuja (o golpea)
        }
        d = contactDist;
      }

      if (p.state === 'fleeing') continue;

      if (def.pushRadius > 0 && d <= def.pushRadius + def.radius) {
        p.resolve -= def.dispersal * force.dispersalMult * dt * resist * this.loyaltyFactor;
        if (force.knockback > 0) {
          p.x += nx * force.knockback * dt;
          p.z += nz * force.knockback * dt;
        }
        contacts++;
      }
      if (def.fearAura && d <= def.fearAura) p.resolve -= 0.08 * dt * resist;
    }

    if ((u.type === 'soldier' || u.type === 'shield') && isIdle(u)) this.faceNearestThreat(u, dt);
    if (u.type === 'ballena') this.spray(u, def, dt, resist);

    if (contacts > 0 && this.forceLevel > 0 && this.rng.chance(dt * 2.5)) {
      this.anger = Math.min(1, this.anger + 0.002 * this.forceLevel);
      this.events.push({
        type: 'impact',
        x: u.x + Math.sin(u.heading) * 1.2,
        z: u.z + Math.cos(u.heading) * 1.2,
        level: this.forceLevel,
      });
    }
  }

  private faceNearestThreat(u: Unit, dt: number): void {
    const p = this.nearestProtester(u.x, u.z, 14, 0);
    if (p) turnToward(u, p.x, p.z, dt * 3);
  }

  private spray(u: Unit, def: UnitDef, dt: number, resist: number): void {
    u.sprayTarget = null;
    if (u.water <= 0) return;
    const target = this.nearestProtester(u.x, u.z, def.sprayRange ?? 0, 1.5);
    if (!target) return;

    this.sprayingNow++;
    u.sprayTarget = { x: target.x, z: target.z };
    u.water = Math.max(0, u.water - dt);
    if (isIdle(u)) turnToward(u, target.x, target.z, dt * 2);

    const power = Math.sqrt(FORCE_LEVELS[this.forceLevel].dispersalMult);
    this.grid.query(target.x, target.z, SPRAY_SPLASH, this.near);
    for (const i of this.near) {
      const p = this.protesters[i];
      if (p.state === 'gone' || p.state === 'fleeing') continue;
      if (Math.hypot(p.x - target.x, p.z - target.z) > SPRAY_SPLASH) continue;
      const dx = p.x - u.x;
      const dz = p.z - u.z;
      const dist = Math.hypot(dx, dz) || 1;
      p.resolve -= 0.75 * dt * power * resist * this.loyaltyFactor;
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
  }

  private updateFires(dt: number): void {
    for (let i = this.fires.length - 1; i >= 0; i--) {
      const f = this.fires[i];
      f.life -= dt;
      if (f.life <= 0) {
        this.fires.splice(i, 1);
        continue;
      }
      for (const u of this.units) {
        if (Math.hypot(u.x - f.x, u.z - f.z) < f.r + UNITS[u.type].radius) {
          u.integrity -= 10 * dt * this.fx.projectileDamageMult;
        }
      }
    }
  }

  private protesterActions(dt: number): void {
    // Los líderes contagian ánimo a los que tienen cerca.
    for (const leader of this.protesters) {
      if (leader.kind !== 'lider' || (leader.state !== 'advancing' && leader.state !== 'occupying')) continue;
      this.grid.query(leader.x, leader.z, LEADER_RADIUS, this.near);
      for (const i of this.near) {
        const p = this.protesters[i];
        if (p.state === 'fleeing' || p.state === 'gone') continue;
        p.resolve = Math.min(p.maxResolve, p.resolve + 0.05 * dt);
      }
    }

    const palaceMult = CROWD_STAGES[this.stage].palaceMult;
    for (const p of this.protesters) {
      if (p.state === 'gone') continue;

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

      if (p.state === 'occupying') {
        this.palaceHp -= 0.1 * dt * (p.kind === 'radical' ? 2 : 1) * (1 + this.anger) * palaceMult;
      }
      this.useWeapon(p, dt);
      this.maybeBurnTire(p, dt);
    }
  }

  private useWeapon(p: Protester, dt: number): void {
    const molotov = p.weapon === 'molotov' && this.stage >= 3;
    const rock = this.stage >= 1 && (p.weapon === 'piedra' || (p.weapon === 'molotov' && !molotov));
    if (!molotov && !rock) return;

    p.throwCd -= dt;
    if (p.throwCd > 0) return;
    const target = this.nearestUnit(p.x, p.z, molotov ? MOLOTOV_RANGE : THROW_RANGE);
    if (!target) {
      p.throwCd = 0.6;
      return;
    }
    const dmg = this.fx.projectileDamageMult;
    if (molotov) {
      target.integrity -= 6 * dmg;
      this.fires.push({ kind: 'molotov', x: target.x, z: target.z, r: 2.2, life: 5 });
      this.events.push({ type: 'molotov', fromX: p.x, fromZ: p.z, toX: target.x, toZ: target.z });
      p.throwCd = this.rng.range(6, 9);
    } else {
      target.integrity -= (3 + 3 * this.anger) * dmg;
      this.events.push({ type: 'throw', fromX: p.x, fromZ: p.z, toX: target.x, toZ: target.z });
      p.throwCd = this.rng.range(2, 4) * (1.3 - this.anger * 0.7);
    }
  }

  /** Trancas: los radicales encienden cauchos en plena calle (queman a las tropas que pasen). */
  private maybeBurnTire(p: Protester, dt: number): void {
    if (!this.def.burnsTires || p.kind !== 'radical' || this.stage < 1 || p.state !== 'advancing') return;
    if (this.fires.filter((f) => f.kind === 'tire').length >= 8 || !this.rng.chance(dt * 0.025 * this.stage)) return;
    if (p.z > 30 || p.z < -12) return;
    this.fires.push({ kind: 'tire', x: p.x, z: p.z, r: 1.6, life: 12 });
    this.events.push({ type: 'tire', x: p.x, z: p.z });
  }

  private removeBrokenUnits(): void {
    for (let i = this.units.length - 1; i >= 0; i--) {
      const u = this.units[i];
      if (u.integrity > 0) continue;
      this.units.splice(i, 1);
      this.brokenUnits++;
      this.events.push({ type: 'unitBroken', unitType: u.type, x: u.x, z: u.z });
    }
  }

  private checkEnd(): void {
    if (this.palaceHp <= 0) this.finish(false, 'palace');
    else if (this.marchStarted && this.spawned >= this.total && this.activeCount === 0) this.finish(true, 'cleared');
    else if (this.elapsed >= this.duration) this.finish(true, 'time');
  }

  private finish(won: boolean, reason: RiotResult['reason']): void {
    const fleeing = this.protesters.filter((p) => p.state === 'fleeing').length;
    this.palaceHp = Math.max(0, this.palaceHp);
    this.result = {
      won,
      reason,
      total: this.total,
      dispersed: this.dispersed + fleeing,
      elapsed: this.elapsed,
      avgForce: this.forceIntegral / Math.max(this.elapsed, 1),
      tanquetas: this.tanquetasDeployed,
      brokenUnits: this.brokenUnits,
      palaceHp: this.palaceHp,
      peakStage: this.peakStage,
      finalAnger: this.anger,
    };
  }

  // ─── Utilidades ────────────────────────────────────────────────────────

  private nearestProtester(x: number, z: number, range: number, minDist: number): Protester | null {
    let best: Protester | null = null;
    let bestD = range;
    this.grid.query(x, z, range, this.near);
    for (const i of this.near) {
      const p = this.protesters[i];
      if (p.state === 'gone' || p.state === 'fleeing') continue;
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
      const d = Math.hypot(u.x - x, u.z - z);
      if (d < bestD) {
        bestD = d;
        best = u;
      }
    }
    return best;
  }
}

/** Ira con la que arranca una protesta: su carácter + la molestia acumulada del país. */
export function initialAnger(def: RiotDef, unrest: number): number {
  return clamp(def.aggression * 0.6 + (unrest / 100) * 0.5, 0, 0.95);
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
