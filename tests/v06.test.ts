import { describe, expect, it } from 'vitest';
import { Random } from '../src/core/Random';
import { RIOTS } from '../src/data/riots';
import type { UnitType } from '../src/data/units';
import { applyRiotResult, createRegime } from '../src/sim/regime';
import { PREP_TIME, RiotSim, type RiotConfig } from '../src/sim/riot/RiotSim';
import { makeStock } from './helpers';

function sim(over: Partial<RiotConfig> = {}, stock: Partial<Record<UnitType, number>> = {}): RiotSim {
  return new RiotSim({
    def: RIOTS.chalecos,
    scale: 1,
    stock: makeStock({ soldier: 12, shotgun: 4, army: 4, moto: 3, capture: 2, tanqueta: 1, gastruck: 1, barricade: 4, ...stock }),
    loyalty: 80,
    unrest: 40,
    seed: 11,
    ...over,
  });
}

function run(s: RiotSim, seconds: number, onStep?: () => void): void {
  for (let t = 0; t < seconds && !s.result; t += 1 / 30) {
    s.step(1 / 30);
    onStep?.();
  }
}

describe('fuego real', () => {
  it('sin mano dura la policía no mata a nadie', () => {
    const s = sim();
    for (let x = -10; x <= 10; x += 5) s.deploy('shotgun', x, 14);
    s.setForce(2);
    run(s, PREP_TIME + 40);
    expect(s.deaths).toBe(0);
  });

  it('con mano dura las escopetas usan munición letal: hay muertos y caídos en el suelo', () => {
    const s = sim();
    for (let x = -10; x <= 10; x += 5) s.deploy('shotgun', x, 14);
    s.setForce(3);
    run(s, PREP_TIME + 40);
    expect(s.deaths).toBeGreaterThan(0);
    expect(s.protesters.some((p) => p.state === 'dead')).toBe(true);
  });

  it('el ejército dispara fuego real desde perdigones', () => {
    const s = sim();
    for (let x = -9; x <= 9; x += 6) s.deploy('army', x, 12);
    s.setForce(2);
    let opened = false;
    run(s, PREP_TIME + 40, () => (opened ||= s.events.some((e) => e.type === 'openFire' && e.by === 'army')));
    expect(opened).toBe(true);
  });

  it('los antidisturbios no disparan por debajo de mano dura', () => {
    const calm = sim();
    for (let x = -9; x <= 9; x += 3) calm.deploy('soldier', x, 12);
    calm.setForce(2);
    run(calm, PREP_TIME + 30);
    expect(calm.deaths).toBe(0);
  });

  it('con mano dura toda la policía saca la pistola, sin necesidad de mejora', () => {
    const s = sim();
    for (let x = -9; x <= 9; x += 3) s.deploy('soldier', x, 12);
    s.setForce(3);
    let shots = 0;
    run(s, PREP_TIME + 40, () => (shots += s.events.filter((e) => e.type === 'liveShot').length));
    expect(shots).toBeGreaterThan(0);
  });

  it('los muertos tienen consecuencias muy duras', () => {
    const base = {
      won: true, reason: 'time' as const, total: 100, dispersed: 50, elapsed: 100, avgForce: 0, tanquetas: 0,
      brokenUnits: 0, palaceHp: 90, peakStage: 0 as const, finalAnger: 0.2, arrests: 0, pressIncidents: 0,
      armyDeployed: 0, deserted: 0, harshness: 0, palaceFallen: false, occupiedSeconds: 0, deaths: 0, injured: 0,
      leadersKilled: 0, soldiersKilled: 0, tanquetaSeconds: 0,
    };
    const a = createRegime(new Random(1));
    const b = createRegime(new Random(1));
    applyRiotResult(a, base, RIOTS.chalecos);
    applyRiotResult(b, { ...base, deaths: 12, leadersKilled: 1 }, RIOTS.chalecos);
    expect(b.intlPressure).toBeGreaterThan(a.intlPressure + 15);
    expect(b.unrest).toBeGreaterThan(a.unrest + 8);
  });
});

describe('manifestantes armados', () => {
  it('con molestia extrema y caos, hay armas de fuego y pueden caer agentes', () => {
    const s = sim({ unrest: 95, def: RIOTS.puerto });
    for (let x = -12; x <= 12; x += 3) s.deploy('soldier', x, 8);
    s.setForce(2); // con mano dura la policía abatiría a los armados antes de que disparen
    let gunshots = 0;
    run(s, 110, () => (gunshots += s.events.filter((e) => e.type === 'gunshot').length));
    expect(gunshots).toBeGreaterThan(0);
  });
});

describe('unidades rediseñadas', () => {
  it('la infantería sale a enfrentar a la multitud según el nivel de fuerza (no se queda quieta)', () => {
    const s = sim({ unrest: 10 });
    const u = s.deploy('soldier', 0, 0)!;
    s.setForce(2);
    run(s, PREP_TIME + 12);
    expect(Math.hypot(u.x, u.z)).toBeGreaterThan(1);
  });

  it('con contención la infantería mantiene su posición', () => {
    const s = sim({ unrest: 10 });
    const u = s.deploy('soldier', 0, 0)!;
    s.setForce(0);
    run(s, PREP_TIME + 12);
    expect(Math.hypot(u.x, u.z)).toBeLessThan(0.5);
  });

  it('los motorizados embisten grupos', () => {
    const s = sim({ unrest: 10 });
    s.deploy('moto', 0, 10);
    s.setForce(1);
    let charges = 0;
    run(s, PREP_TIME + 30, () => (charges += s.events.filter((e) => e.type === 'charge').length));
    expect(charges).toBeGreaterThan(0);
  });

  it('el camión lanzagás obedece la orden manual (F)', () => {
    const s = sim();
    const truck = s.deploy('gastruck', 0, 0)!;
    s.setForce(1);
    s.orderAbility(truck.id, 5, 10);
    s.step(1 / 30);
    expect(s.gasClouds.some((g) => Math.hypot(g.x - 5, g.z - 10) < 1)).toBe(true);
  });

  it('la tanqueta atrae las piedras', () => {
    const s = sim({ unrest: 70 });
    const t = s.deploy('tanqueta', 0, 6)!;
    s.deploy('soldier', 3, 6);
    s.setForce(1);
    run(s, PREP_TIME + 40);
    expect(t.integrity).toBeLessThan(t.maxIntegrity);
    expect(s.tanquetaSeconds).toBeGreaterThan(0);
  });

  it('el equipo de captura se queda en su sitio si no hay líderes cerca', () => {
    const s = sim({ unrest: 0 });
    const c = s.deploy('capture', 0, -15)!;
    run(s, PREP_TIME + 3);
    expect(Math.hypot(c.x, c.z + 15)).toBeLessThan(0.5);
    expect(c.maxIntegrity).toBe(120);
  });
});
