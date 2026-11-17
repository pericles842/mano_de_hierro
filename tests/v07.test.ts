import { describe, expect, it } from 'vitest';
import { Random } from '../src/core/Random';
import { RIOTS } from '../src/data/riots';
import { UNITS, type UnitType } from '../src/data/units';
import { buyUpgrade, createRegime } from '../src/sim/regime';
import { PREP_TIME, RiotSim, type RiotConfig } from '../src/sim/riot/RiotSim';
import { makeStock } from './helpers';

function sim(over: Partial<RiotConfig> = {}, stock: Partial<Record<UnitType, number>> = {}): RiotSim {
  return new RiotSim({
    def: RIOTS.chalecos,
    scale: 1,
    stock: makeStock({ soldier: 10, shield: 3, gasser: 3, shotgun: 3, moto: 2, capture: 2, ballena: 1, gastruck: 1, tanqueta: 1, army: 3, ...stock }),
    loyalty: 80,
    unrest: 30,
    seed: 5,
    ...over,
  });
}

function run(s: RiotSim, seconds: number, onStep?: () => void): void {
  for (let t = 0; t < seconds && !s.result; t += 1 / 30) {
    s.step(1 / 30);
    onStep?.();
  }
}

describe('niveles de fuerza', () => {
  it('en contención nadie dispara: ni gas, ni agua, ni perdigones', () => {
    const s = sim();
    const g = s.deploy('gasser', 0, 12)!;
    const sh = s.deploy('shotgun', 4, 12)!;
    const b = s.deploy('ballena', -5, 12)!;
    s.setForce(0);
    let fired = 0;
    run(s, PREP_TIME + 30, () => (fired += s.events.filter((e) => e.type === 'gas' || e.type === 'shot' || e.type === 'spray').length));
    expect(fired).toBe(0);
    expect(g.ammo).toBe(g.maxAmmo);
    expect(sh.ammo).toBe(sh.maxAmmo);
    expect(b.water).toBeGreaterThan(0);
  });

  it('los perdigones llegan con «Fuerza dispersiva», no con «Contención agresiva»', () => {
    const agresiva = sim();
    agresiva.deploy('shotgun', 0, 12);
    agresiva.setForce(1);
    let shots = 0;
    run(agresiva, PREP_TIME + 30, () => (shots += agresiva.events.filter((e) => e.type === 'shot').length));
    expect(shots).toBe(0);

    const dispersiva = sim();
    dispersiva.deploy('shotgun', 0, 12);
    dispersiva.setForce(2);
    shots = 0;
    run(dispersiva, PREP_TIME + 30, () => (shots += dispersiva.events.filter((e) => e.type === 'shot').length));
    expect(shots).toBeGreaterThan(0);
  });

  it('con fuerza dispersiva antidisturbios y escudos dan palizas', () => {
    const s = sim({ unrest: 50 });
    for (let x = -8; x <= 8; x += 2) s.deploy('soldier', x, 14);
    s.deploy('shield', 0, 10);
    s.setForce(2);
    let beatings = 0;
    run(s, PREP_TIME + 50, () => (beatings += s.events.filter((e) => e.type === 'beating').length));
    expect(beatings).toBeGreaterThan(0);
  });

  it('el granadero: nubes de 4 s y recarga de 2 s', () => {
    const s = sim();
    const g = s.deploy('gasser', 0, 12)!;
    s.setForce(1);
    let cloudLife = 0;
    run(s, PREP_TIME + 30, () => {
      for (const c of s.gasClouds) cloudLife = Math.max(cloudLife, c.maxLife);
    });
    expect(cloudLife).toBe(4);
    expect(g.maxAmmo - g.ammo).toBeGreaterThan(2);
  });
});

describe('palizas', () => {
  it('la paliza dura casi 2 s, con varios golpes, y luego el apaleado huye', () => {
    const s = sim({ unrest: 50 });
    for (let x = -8; x <= 8; x += 2) s.deploy('soldier', x, 14);
    s.setForce(2);
    let victim = -1;
    let heldFor = 0;
    let strikes = 0;
    run(s, PREP_TIME + 60, () => {
      const u = s.units.find((v) => v.beatId !== null);
      if (u && victim < 0) victim = u.beatId!;
      if (victim >= 0 && s.units.some((v) => v.beatId === victim)) heldFor += 1 / 30;
      strikes += s.events.filter((e) => e.type === 'beating').length;
    });
    expect(victim).toBeGreaterThanOrEqual(0);
    expect(heldFor).toBeGreaterThan(1.5);
    expect(strikes).toBeGreaterThanOrEqual(3);
    expect(['fleeing', 'gone', 'injured']).toContain(s.protesters[victim].state);
  });
});

describe('vehículos desde el palacio', () => {
  it('no se pueden colocar a mano ni sacar durante la preparación', () => {
    const s = sim({ planning: 60 });
    expect(s.canDeploy('tanqueta', 0, 10)).toBe(false);
    expect(s.dispatchVehicle('tanqueta')).toBeNull();
    expect(s.canDeploy('barricade', 0, 10)).toBe(false); // sin stock de barricadas en este test
  });

  it('salen por la puerta del palacio y van hacia el centro', () => {
    const s = sim();
    const t = s.dispatchVehicle('tanqueta')!;
    expect(t).not.toBeNull();
    expect(t.z).toBeLessThan(-18);
    run(s, 8);
    expect(t.z).toBeGreaterThan(0);
    expect(s.available.tanqueta).toBe(0);
  });
});

describe('tropas autónomas', () => {
  it('el equipo de captura también arresta a manifestantes normales', () => {
    const s = sim({ unrest: 20, def: { ...RIOTS.chalecos, leaders: 0 } });
    s.deploy('capture', 0, 14);
    s.deploy('capture', 6, 14);
    run(s, PREP_TIME + 60);
    expect(s.arrests).toBeGreaterThan(0);
  });

  it('los motorizados embisten incluso en contención y arrastran gente fuera', () => {
    const s = sim({ unrest: 20 });
    s.deploy('moto', -4, 14);
    s.deploy('moto', 4, 14);
    s.setForce(0);
    let charges = 0;
    run(s, PREP_TIME + 70, () => (charges += s.events.filter((e) => e.type === 'charge').length));
    expect(charges).toBeGreaterThan(0);
    expect(s.arrests).toBeGreaterThan(0);
  });

  it('las tropas agresivas provocan: la multitud se enfada más con ejército y tanqueta en la calle', () => {
    const calm = sim({ unrest: 20 });
    calm.deploy('soldier', 0, 10);
    const provoked = sim({ unrest: 20 });
    provoked.deploy('soldier', 0, 10);
    for (const x of [-6, 0, 6]) provoked.deploy('army', x, 4);
    provoked.deploy('tanqueta', 0, 0);
    run(calm, PREP_TIME + 30);
    run(provoked, PREP_TIME + 30);
    expect(provoked.anger).toBeGreaterThan(calm.anger);
  });

});

describe('presencia intimidante de los vehículos', () => {
  /** Ánimo medio de los tranquilos cerca de un punto. */
  function calmResolve(s: RiotSim, x: number, z: number): number {
    const near = s.protesters.filter(
      (p) => (p.kind === 'pacifico' || p.kind === 'medico') && p.state === 'advancing' && Math.hypot(p.x - x, p.z - z) < 8,
    );
    return near.reduce((a, p) => a + p.resolve / p.maxResolve, 0) / Math.max(1, near.length);
  }

  it('una ballena quieta en contención asusta a la gente tranquila en una protesta pacífica', () => {
    const def = { ...RIOTS.cacerolazo, aggression: 0 };
    const without = sim({ def, unrest: 0, seed: 9 });
    const withTruck = sim({ def, unrest: 0, seed: 9 });
    withTruck.deploy('ballena', 0, 6);
    withTruck.setForce(0);
    run(without, PREP_TIME + 35);
    run(withTruck, PREP_TIME + 35);
    expect(withTruck.stage).toBe(0);
    expect(calmResolve(withTruck, 0, 6)).toBeLessThan(calmResolve(without, 0, 6));
  });

  it('cada vehículo intimida solo en sus fases: el lanzagás deja de hacerlo en cuanto la protesta se tensa', () => {
    const tense = sim({ unrest: 20 });
    tense.anger = 0.4; // fase Tensa
    const truck = tense.deploy('gastruck', 0, 6)!;
    tense.setForce(0);
    run(tense, PREP_TIME + 2);
    expect(tense.stage).toBeGreaterThanOrEqual(1);
    // En Tensa el lanzagás ya no asusta, pero la ballena sí.
    expect(UNITS_PRESENCE('gastruck', tense.stage)).toBe(0);
    expect(UNITS_PRESENCE('ballena', 1)).toBeGreaterThan(0);
    expect(UNITS_PRESENCE('ballena', 2)).toBe(0);
    expect(UNITS_PRESENCE('tanqueta', 2)).toBeGreaterThan(0);
    void truck;
  });
});

describe('fuego', () => {
  it('la ballena apaga los cauchos a tiro, incluso en contención', () => {
    const s = sim();
    s.deploy('ballena', 0, 0);
    s.setForce(0);
    s.fires.push({ kind: 'tire', x: 0, z: 8, r: 1.6, life: 12 });
    run(s, 5);
    expect(s.fires.length).toBe(0);
  });

  it('un vehículo que pasa por encima del fuego lo apaga y no se quema', () => {
    const s = sim();
    const t = s.deploy('tanqueta', 0, 0)!;
    s.fires.push({ kind: 'tire', x: 0, z: 0.5, r: 1.6, life: 12 });
    s.step(1 / 30);
    s.step(1 / 30);
    expect(s.fires.length).toBe(0);
    expect(t.integrity).toBe(t.maxIntegrity);
  });
});

function UNITS_PRESENCE(type: UnitType, stage: number): number {
  return UNITS[type].presence?.byStage[stage] ?? 0;
}

describe('mejoras', () => {
  it('los pinchos exigen tener antes el concreto', () => {
    const r = createRegime(new Random(1));
    r.treasury = 5000;
    expect(buyUpgrade(r, 'pinchos')).toBe(false);
    expect(buyUpgrade(r, 'concreto')).toBe(true);
    expect(buyUpgrade(r, 'pinchos')).toBe(true);
  });

  it('con vallas desplegables las barricadas se mueven también durante la protesta', () => {
    const plain = sim({}, { barricade: 2 });
    const a = plain.deploy('barricade', 0, 0)!;
    expect(plain.relocate(a.id, 4, 0, 0)).toBe(false);
    const fenced = sim({ upgrades: ['vallas'] }, { barricade: 2 });
    const b = fenced.deploy('barricade', 0, 0)!;
    expect(fenced.relocate(b.id, 4, 0, 0)).toBe(true);
    expect(fenced.dismantle(b.id)).toBe(true);
  });

  it('la barricada con pinchos hiere a quien empuja contra ella', () => {
    const s = sim({ upgrades: ['concreto', 'pinchos'], unrest: 40 }, { barricade: 8 });
    for (let x = -10; x <= 10; x += 3.9) s.deploy('barricade', x, 20);
    run(s, PREP_TIME + 60);
    expect(s.injuredCount).toBeGreaterThan(0);
  });
});
