import { describe, expect, it } from 'vitest';
import { Random } from '../src/core/Random';
import { RIOTS } from '../src/data/riots';
import { createRegime, devUnlock, endDay, releaseEffects, releasePrisoners } from '../src/sim/regime';
import { PREP_TIME, RiotSim } from '../src/sim/riot/RiotSim';
import { makeStock } from './helpers';

const sim = (seed: number, unrest = 20, def = RIOTS.cacerolazo): RiotSim =>
  new RiotSim({ def, scale: 1, stock: makeStock({ soldier: 10, barricade: 10 }), loyalty: 70, unrest, seed });

function run(s: RiotSim, seconds: number): void {
  for (let t = 0; t < seconds && !s.result; t += 1 / 30) s.step(1 / 30);
}

describe('ritmo de las protestas', () => {
  it('al arrancar la marcha, una protesta tranquila protesta en la plaza antes de avalancharse', () => {
    const s = sim(3, 0);
    run(s, PREP_TIME + 2);
    expect(s.marchStarted).toBe(true);
    expect(s.crowdMode).toBe('rally');
  });

  it('el momento de la avalancha es aleatorio, pero tarde o temprano llega', () => {
    const times = [1, 2, 3, 4, 5].map((seed) => {
      const s = sim(seed, 10);
      let at = -1;
      for (let t = 0; t < 120 && at < 0; t += 1 / 30) {
        s.step(1 / 30);
        if (s.events.some((e) => e.type === 'surge')) at = s.elapsed;
      }
      return at;
    });
    expect(times.every((t) => t > PREP_TIME)).toBe(true);
    expect(new Set(times.map((t) => Math.round(t))).size).toBeGreaterThan(1);
  });

  it('con mucha molestia social se avalanchan antes', { timeout: 30000 }, () => {
    const avg = (unrest: number): number => {
      let total = 0;
      for (let seed = 1; seed <= 3; seed++) {
        const s = sim(seed, unrest);
        for (let t = 0; t < 90; t += 1 / 30) {
          s.step(1 / 30);
          if (s.crowdMode === 'surge') break;
        }
        total += s.elapsed;
      }
      return total / 3;
    };
    expect(avg(90)).toBeLessThan(avg(0));
  });
});

describe('palacio', () => {
  it('si el palacio cae, la protesta se pierde en ese momento', () => {
    const s = sim(3, 60, RIOTS.pan);
    run(s, 300);
    expect(s.result?.won).toBe(false);
    expect(s.result?.reason).toBe('palace');
    expect(s.result!.elapsed).toBeLessThan(s.duration);
  });
});

describe('presos políticos', () => {
  it('se acumulan con los arrestos y cuestan cada día', () => {
    const st = createRegime(new Random(1));
    st.prisoners = 20;
    const before = st.intlPressure;
    endDay(st, null, new Random(2));
    expect(st.intlPressure).toBeGreaterThan(before - 2);
  });

  it('se elige cuántos liberar: gesto baja la presión, canje da dinero', () => {
    const st = createRegime(new Random(1));
    st.prisoners = 10;
    st.intlPressure = 50;
    const money = st.treasury;
    releasePrisoners(st, 4, 'canje');
    expect(st.prisoners).toBe(6);
    expect(st.treasury).toBeGreaterThan(money);
    releasePrisoners(st, 99, 'gesto');
    expect(st.prisoners).toBe(0);
    expect(releasePrisoners(st, 1, 'gesto')).toBeNull();
    expect(releaseEffects(10, 'gesto').intlPressure).toBeLessThan(releaseEffects(10, 'canje').intlPressure);
  });
});

describe('modo developer', () => {
  it('desbloquea todas las tropas', () => {
    const st = createRegime(new Random(1));
    devUnlock(st);
    expect(Object.values(st.stock).every((n) => n >= 30)).toBe(true);
    const s = sim(1);
    s.devUnlockAll();
    expect(Object.values(s.available).every((n) => n === 99)).toBe(true);
  });
});
