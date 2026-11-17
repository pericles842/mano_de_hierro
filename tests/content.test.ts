import { describe, expect, it } from 'vitest';
import { Random } from '../src/core/Random';
import { EVENTS } from '../src/data/events';
import { RIOTS } from '../src/data/riots';
import type { UnitType } from '../src/data/units';
import { applyEventOption, buyUpgrade, createRegime, endDay, rollEvent } from '../src/sim/regime';
import { PREP_TIME, RiotSim } from '../src/sim/riot/RiotSim';

const STOCK: Record<UnitType, number> = { soldier: 20, shield: 6, barricade: 12, ballena: 1, tanqueta: 1 };

function run(sim: RiotSim, seconds: number): void {
  for (let t = 0; t < seconds && !sim.result; t += 1 / 30) sim.step(1 / 30);
}

describe('barricadas', () => {
  it('una hilera de barricadas sella la avenida sur: nadie la cruza', () => {
    const sim = new RiotSim({ def: RIOTS.cacerolazo, scale: 1, stock: { ...STOCK }, loyalty: 70, unrest: 20, seed: 11 });
    for (let x = -13.65; x <= 13.7; x += 3.9) expect(sim.deploy('barricade', x, 31)).not.toBeNull();
    run(sim, PREP_TIME + 25);
    const crossed = sim.protesters.filter((p) => p.state !== 'gone' && p.z < 29.5);
    expect(crossed.length).toBe(0);
  });

  it('se pueden colocar en la boca de las calles pero no dentro de los edificios', () => {
    const sim = new RiotSim({ def: RIOTS.cacerolazo, scale: 1, stock: { ...STOCK }, loyalty: 70, unrest: 20, seed: 1 });
    expect(sim.canDeploy('barricade', 0, 32)).toBe(true);
    expect(sim.canDeploy('barricade', 32, 0)).toBe(true);
    expect(sim.canDeploy('barricade', 32, 10)).toBe(false);
  });
});

describe('mejoras', () => {
  it('se compran una sola vez y refuerzan a las tropas', () => {
    const s = createRegime(new Random(1));
    s.treasury = 2000;
    expect(buyUpgrade(s, 'concreto')).toBe(true);
    expect(buyUpgrade(s, 'concreto')).toBe(false);
    const sim = new RiotSim({ def: RIOTS.chalecos, scale: 1, stock: { ...STOCK }, loyalty: 70, unrest: 20, seed: 1, upgrades: s.upgrades });
    const plain = new RiotSim({ def: RIOTS.chalecos, scale: 1, stock: { ...STOCK }, loyalty: 70, unrest: 20, seed: 1 });
    expect(sim.deploy('barricade', 0, 0)!.maxIntegrity).toBe(plain.deploy('barricade', 0, 0)!.maxIntegrity * 2);
  });

  it('la telenovela patriótica baja la molestia cada día', () => {
    const a = createRegime(new Random(1));
    const b = createRegime(new Random(1));
    b.upgrades.push('propaganda');
    endDay(a, null, new Random(2));
    endDay(b, null, new Random(2));
    expect(b.unrest).toBeLessThan(a.unrest);
  });
});

describe('eventos del despacho', () => {
  it('cada opción aplica sus efectos y el stock nunca queda negativo', () => {
    const s = createRegime(new Random(1));
    s.stock.soldier = 1;
    const desercion = EVENTS.find((e) => e.id === 'desercion')!;
    applyEventOption(s, desercion.options[1]);
    expect(s.stock.soldier).toBe(0);
  });

  it('no repite eventos seguidos y respeta las condiciones', () => {
    const s = createRegime(new Random(1));
    s.intlPressure = 0;
    const rng = new Random(5);
    const seen: string[] = [];
    for (let i = 0; i < 30; i++) {
      const e = rollEvent(s, rng);
      if (e) seen.push(e.id);
    }
    expect(seen).not.toContain('sanciones');
    for (let i = 1; i < seen.length; i++) expect(seen[i]).not.toBe(seen[i - 1]);
  });
});

describe('revueltas nuevas', () => {
  it('las trancas encienden cauchos cuando la protesta se calienta', () => {
    const sim = new RiotSim({ def: RIOTS.trancas, scale: 1, stock: { ...STOCK }, loyalty: 70, unrest: 60, seed: 2 });
    sim.setForce(3);
    let tires = 0;
    for (let t = 0; t < 90 && !sim.result; t += 1 / 30) {
      sim.step(1 / 30);
      tires += sim.events.filter((e) => e.type === 'tire').length;
    }
    expect(tires).toBeGreaterThan(0);
  });
});
