import { describe, expect, it } from 'vitest';
import { RIOTS } from '../src/data/riots';
import type { UnitType } from '../src/data/units';
import { PREP_TIME, RiotSim, type RiotConfig } from '../src/sim/riot/RiotSim';
import { makeStock } from './helpers';

function sim(over: Partial<RiotConfig> = {}, stock: Partial<Record<UnitType, number>> = {}): RiotSim {
  return new RiotSim({
    def: RIOTS.chalecos,
    scale: 1,
    stock: makeStock({ soldier: 10, shield: 2, sniper: 5, colectivo: 4, capture: 2, ...stock }),
    loyalty: 80,
    unrest: 30,
    seed: 3,
    ...over,
  });
}

function run(s: RiotSim, seconds: number, onStep?: () => void): void {
  for (let t = 0; t < seconds && !s.result; t += 1 / 30) {
    s.step(1 / 30);
    onStep?.();
  }
}

describe('francotiradores', () => {
  it('los colocas donde quieras sobre la azotea del palacio, nunca en la plaza ni amontonados', () => {
    const s = sim();
    expect(s.canDeploy('sniper', 0, 10)).toBe(false); // en la plaza, no
    expect(s.canDeploy('sniper', 0, -27)).toBe(false); // encima de la cúpula, no
    expect(s.deploy('sniper', -6, -24)).not.toBeNull();
    expect(s.canDeploy('sniper', -6.5, -24)).toBe(false); // pegado a otro, no
    expect(s.deploy('sniper', 6, -28)).not.toBeNull(); // en otra esquina, sí
    expect(s.available.sniper).toBe(3); // cuestan una tropa cada uno
  });

  it('sin mano dura solo vigila: marca objetivos de alto valor pero no dispara', () => {
    const s = sim({ unrest: 70 });
    s.deploy('sniper', -6, -24);
    s.setForce(2);
    let marked = false;
    run(s, PREP_TIME + 40, () => (marked ||= s.protesters.some((p) => p.marked > 0)));
    expect(marked).toBe(true);
    expect(s.deaths).toBe(0);
  });

  it('con mano dura asesina a su objetivo, pero tarda en apuntar', () => {
    const s = sim({ unrest: 70 });
    s.deploy('sniper', -6, -24);
    s.setForce(3);
    let firstShot = -1;
    let aimingSince = -1;
    run(s, PREP_TIME + 60, () => {
      const u = s.units[0];
      if (aimingSince < 0 && u.aimId !== null) aimingSince = s.elapsed;
      if (firstShot < 0 && s.events.some((e) => e.type === 'liveShot')) firstShot = s.elapsed;
    });
    expect(firstShot).toBeGreaterThan(0);
    expect(firstShot - aimingSince).toBeGreaterThanOrEqual(6.5); // ~7 s apuntando
  });

  it('cada disparo aterroriza a la plaza', () => {
    const s = sim({ unrest: 70 });
    s.deploy('sniper', -6, -24);
    s.setForce(3);
    let before = 0;
    let after = 0;
    run(s, PREP_TIME + 60, () => {
      if (after > 0) return;
      const calm = s.protesters.filter((p) => p.kind === 'pacifico' && p.state === 'advancing');
      const avg = calm.reduce((a, p) => a + p.resolve / p.maxResolve, 0) / Math.max(1, calm.length);
      if (s.events.some((e) => e.type === 'liveShot')) after = avg;
      else before = avg;
    });
    expect(after).toBeGreaterThan(0);
    expect(after).toBeLessThan(before);
  });

  it('las capturas van a por los objetivos que marca el francotirador', () => {
    const s = sim({ unrest: 40 });
    s.deploy('sniper', -6, -24);
    s.deploy('sniper', 6, -24);
    s.deploy('capture', 0, 14);
    run(s, PREP_TIME + 60);
    expect(s.arrests).toBeGreaterThan(0);
  });
});

describe('motorizados', () => {
  it('montan al detenido en la moto, se lo llevan a la puerta del palacio y allí desaparece', () => {
    const s = sim({ unrest: 20 }, { moto: 2 });
    s.deploy('moto', -4, 14);
    s.deploy('moto', 4, 14);
    let carriedSeen = false;
    let arrestZ: number | null = null;
    run(s, PREP_TIME + 70, () => {
      if (s.units.some((u) => u.carryId !== null)) carriedSeen = true;
      const a = s.events.find((e) => e.type === 'arrest');
      if (a && arrestZ === null && a.type === 'arrest') arrestZ = a.z;
    });
    expect(carriedSeen).toBe(true);
    expect(arrestZ).not.toBeNull();
    expect(arrestZ!).toBeLessThan(-17); // en la puerta del palacio
  });
});

describe('colectivos paramilitares', () => {
  it('a pie y por su cuenta: disparan a la multitud incluso en contención', () => {
    const s = sim({ unrest: 20 });
    s.deploy('colectivo', -4, 14);
    s.deploy('colectivo', 4, 14);
    s.setForce(0);
    let shots = 0;
    run(s, PREP_TIME + 50, () => (shots += s.events.filter((e) => e.type === 'liveShot').length));
    expect(shots).toBeGreaterThan(0);
  });

  it('se esconden en las esquinas: ahí ni las piedras los alcanzan', () => {
    const s = sim({ unrest: 85, def: RIOTS.puerto });
    const c = s.deploy('colectivo', 26, -18)!; // esquina de la plaza
    run(s, PREP_TIME + 3);
    expect(c.hidden).toBe(true);
  });
});

describe('clima', () => {
  it('la lluvia disipa antes el gas y trae algo menos de gente', () => {
    const dry = sim();
    const wet = sim({ weather: { rain: true } });
    expect(wet.total).toBeLessThan(dry.total);
    for (const s of [dry, wet]) s.gasClouds.push({ x: 0, z: 0, r: 3, life: 8, maxLife: 8 });
    run(dry, 4);
    run(wet, 4);
    expect(wet.gasClouds.length === 0 || wet.gasClouds[0].life < (dry.gasClouds[0]?.life ?? 0)).toBe(true);
  });

  it('de noche tus tropas rinden menos', () => {
    expect(sim({ weather: { night: true } }).night).toBe(true);
    expect(sim().night).toBe(false);
  });
});

describe('exigencias y objetivos', () => {
  it('a mitad de la protesta llega una exigencia; ceder calma y manda gente a casa', () => {
    let s: RiotSim | null = null;
    for (let seed = 1; seed < 30 && !s; seed++) {
      const t = sim({ seed, unrest: 30 });
      run(t, 100, () => undefined);
      if (t.demand) s = t;
    }
    expect(s).not.toBeNull();
    const before = s!.anger;
    s!.resolveDemand(true);
    expect(s!.anger).toBeLessThan(before);
    expect(s!.demand!.accepted).toBe(true);
  });

  it('negarse enfurece y queda apuntado como causa', () => {
    const s = sim({ seed: 4 });
    s.demand = { id: 'pan', accepted: null };
    const before = s.anger;
    s.resolveDemand(false);
    expect(s.anger).toBeGreaterThan(before);
    expect(s.angerSources.exigencias).toBeGreaterThan(0);
  });

  it('cada protesta trae un objetivo secundario (el tutorial no)', () => {
    expect(sim().objective).not.toBeNull();
    expect(sim({ objectives: false }).objective).toBeNull();
  });

  it('el informe sabe qué calentó a la multitud', () => {
    const s = sim({ unrest: 40 });
    for (let x = -8; x <= 8; x += 2) s.deploy('soldier', x, 14);
    s.setForce(2);
    run(s, PREP_TIME + 40);
    expect(s.angerSources.fuerza).toBeGreaterThan(0);
  });
});

describe('líderes', () => {
  it('el número de líderes varía de una protesta a otra', () => {
    const counts = new Set<number>();
    for (let seed = 1; seed <= 12; seed++) counts.add(sim({ seed }).leaderTotal);
    expect(counts.size).toBeGreaterThan(1);
  });

  it('abatir a un líder baja el ánimo de todos (no solo enfurece)', () => {
    // Protesta sin armados: los armados tienen prioridad sobre los líderes.
    const s = sim({ unrest: 10, def: { ...RIOTS.cacerolazo, leaders: 3 } });
    s.deploy('sniper', -6, -24);
    s.deploy('sniper', 6, -24);
    s.setForce(3);
    let killedLeader = false;
    run(s, PREP_TIME + 90, () => {
      if (s.events.some((e) => e.type === 'leaderDown' && e.how === 'killed')) killedLeader = true;
    });
    expect(killedLeader).toBe(true);
    expect(s.leadersDown).toBeGreaterThan(0);
  });
});
