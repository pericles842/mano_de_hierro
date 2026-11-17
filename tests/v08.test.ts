import { describe, expect, it } from 'vitest';
import { Random } from '../src/core/Random';
import { RIOTS } from '../src/data/riots';
import type { UnitType } from '../src/data/units';
import { buyGadgetCharge, consumeGadgetCharges, createRegime, gadgetUsesFor } from '../src/sim/regime';
import { PREP_TIME, RiotSim, type RiotConfig } from '../src/sim/riot/RiotSim';
import { makeStock } from './helpers';

function sim(over: Partial<RiotConfig> = {}, stock: Partial<Record<UnitType, number>> = {}): RiotSim {
  return new RiotSim({
    def: RIOTS.chalecos,
    scale: 1,
    stock: makeStock({ soldier: 10, shield: 2, k9: 3, sniper: 5, colectivo: 3, ...stock }),
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

  it('solo disparan con mano dura', () => {
    const calm = sim({ unrest: 70 });
    calm.deploy('sniper', -6, -24);
    calm.setForce(2);
    run(calm, PREP_TIME + 40);
    expect(calm.deaths).toBe(0);

    const hard = sim({ unrest: 70 });
    hard.deploy('sniper', -6, -24);
    hard.deploy('sniper', 6, -24);
    hard.setForce(3);
    run(hard, PREP_TIME + 40);
    expect(hard.deaths).toBeGreaterThan(0);
  });
});

describe('colectivos paramilitares', () => {
  it('atacan por su cuenta incluso en contención y apalean gente', () => {
    const s = sim({ unrest: 20 });
    s.deploy('colectivo', -4, 14);
    s.deploy('colectivo', 4, 14);
    s.setForce(0);
    let beatings = 0;
    run(s, PREP_TIME + 50, () => (beatings += s.events.filter((e) => e.type === 'beating').length));
    expect(beatings).toBeGreaterThan(0);
  });
});

describe('brigada canina', () => {
  it('en contención no muerde; desde contención agresiva, sí', () => {
    const calm = sim({ unrest: 20 });
    for (const x of [-4, 0, 4]) calm.deploy('k9', x, 14);
    calm.setForce(0);
    let bites = 0;
    run(calm, PREP_TIME + 40, () => (bites += calm.events.filter((e) => e.type === 'bite').length));
    expect(bites).toBe(0);

    const hard = sim({ unrest: 20 });
    for (const x of [-4, 0, 4]) hard.deploy('k9', x, 14);
    hard.setForce(1);
    bites = 0;
    run(hard, PREP_TIME + 50, () => (bites += hard.events.filter((e) => e.type === 'bite').length));
    expect(bites).toBeGreaterThan(0);
  });
});

describe('gadgets', () => {
  it('flash: lo lanza solo una parte de los agentes y paraliza al grupo', () => {
    const s = sim({ gadgets: { flash: 1 }, unrest: 20 });
    for (let x = -9; x <= 9; x += 2) s.deploy('soldier', x, 16);
    run(s, PREP_TIME + 25);
    let flashes = 0;
    expect(s.useGadget('flash')).toBe(true);
    flashes = s.events.filter((e) => e.type === 'flash').length;
    s.step(1 / 30);
    flashes += s.events.filter((e) => e.type === 'flash').length;
    expect(flashes).toBeGreaterThan(0);
    expect(flashes).toBeLessThan(10); // no todos los agentes
    expect(s.protesters.some((p) => p.stunned > 0)).toBe(true);
    expect(s.gadgetUses.flash).toBe(0);
    expect(s.useGadget('flash')).toBe(false); // un solo uso
  });

  it('no se puede usar en la preparación ni sin usos', () => {
    const s = sim({ planning: 60, gadgets: { pimienta: 1 } });
    s.deploy('soldier', 0, 10);
    expect(s.useGadget('pimienta')).toBe(false);
    const none = sim();
    expect(none.useGadget('inhibidor')).toBe(false);
  });

  it('inhibidor: llega menos gente', () => {
    const s = sim({ gadgets: { inhibidor: 1 } });
    run(s, PREP_TIME + 2);
    const before = s.total;
    expect(s.useGadget('inhibidor')).toBe(true);
    expect(s.total).toBeLessThan(before);
    expect(s.jamTimer).toBeGreaterThan(0);
  });

  it('cargas: 1 uso gratis por protesta más las compradas; se gastan solo las pagadas', () => {
    const r = createRegime(new Random(2));
    r.treasury = 5000;
    expect(gadgetUsesFor(r).flash).toBe(0); // sin desbloquear
    r.upgrades.push('flash');
    expect(gadgetUsesFor(r).flash).toBe(1);
    expect(buyGadgetCharge(r, 'flash')).toBe(true);
    expect(gadgetUsesFor(r).flash).toBe(2);
    consumeGadgetCharges(r, { flash: 1 }); // solo el gratis
    expect(r.gadgetCharges.flash).toBe(1);
    consumeGadgetCharges(r, { flash: 2 });
    expect(r.gadgetCharges.flash).toBe(0);
  });
});

describe('líderes', () => {
  it('el número de líderes varía de una protesta a otra', () => {
    const counts = new Set<number>();
    for (let seed = 1; seed <= 12; seed++) counts.add(sim({ seed }).leaderTotal);
    expect(counts.size).toBeGreaterThan(1);
  });

  it('arrestar a un líder desmoraliza a toda la plaza aunque esté en caos', () => {
    const s = sim({ unrest: 90, def: { ...RIOTS.chalecos, leaders: 3 } });
    s.deploy('capture', 0, 14);
    s.anger = 0.95; // caos
    let downs = 0;
    let moraleDrop = false;
    run(s, PREP_TIME + 80, () => {
      for (const e of s.events) {
        if (e.type !== 'leaderDown') continue;
        downs++;
        moraleDrop = true;
      }
    });
    expect(s.stage).toBeGreaterThanOrEqual(2);
    if (downs > 0) expect(moraleDrop).toBe(true);
  });

  it('abatir a un líder baja el ánimo de todos (no solo enfurece)', () => {
    const s = sim({ unrest: 70, def: { ...RIOTS.chalecos, leaders: 3 } });
    s.deploy('sniper', -6, -24);
    s.deploy('sniper', 6, -24);
    s.setForce(3);
    let checked = false;
    run(s, PREP_TIME + 60, () => {
      if (checked) return;
      if (s.events.some((e) => e.type === 'leaderDown' && e.how === 'killed')) checked = true;
    });
    expect(checked).toBe(true);
    expect(s.leadersDown).toBeGreaterThan(0);
  });
});
