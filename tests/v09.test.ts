import { describe, expect, it } from 'vitest';
import { Random } from '../src/core/Random';
import { RIOTS } from '../src/data/riots';
import { applyRiotResult, buyUnit, createRegime, endDay, veteranLevel } from '../src/sim/regime';
import type { RiotResult } from '../src/sim/riot/types';

const base: RiotResult = {
  won: true, reason: 'time', total: 100, dispersed: 50, elapsed: 100, avgForce: 0, tanquetas: 0,
  brokenUnits: 0, palaceHp: 90, peakStage: 0, finalAnger: 0.2, arrests: 0, pressIncidents: 0,
  armyDeployed: 0, deserted: 0, harshness: 0, palaceFallen: false, occupiedSeconds: 0, deaths: 0, injured: 0,
  leadersKilled: 0, soldiersKilled: 0, tanquetaSeconds: 0,
};

describe('campaña', () => {
  it('las tropas se desbloquean por días', () => {
    const r = createRegime(new Random(1));
    r.treasury = 9999;
    expect(buyUnit(r, 'tanqueta')).toBe(false); // día 1
    r.day = 5;
    expect(buyUnit(r, 'tanqueta')).toBe(true);
  });

  it('el último día solo hay una protesta: la Gran Marcha', () => {
    const r = createRegime(new Random(1));
    r.day = r.maxDays - 1;
    endDay(r, null, new Random(2));
    expect(r.status).toBe('playing');
    expect(r.activeRiots).toHaveLength(1);
    expect(r.activeRiots[0].defId).toBe('granmarcha');
  });
});

describe('consecuencias entre días', () => {
  it('matar líderes deja mártires: la siguiente protesta es más grande', () => {
    const calm = createRegime(new Random(1));
    const bloody = createRegime(new Random(1));
    applyRiotResult(bloody, { ...base, deaths: 4, leadersKilled: 1 }, RIOTS.chalecos);
    expect(bloody.martyrs).toBeGreaterThan(0);
    endDay(calm, null, new Random(3));
    endDay(bloody, null, new Random(3));
    expect(bloody.activeRiots[0].scale).toBeGreaterThan(calm.activeRiots[0].scale);
  });

  it('las tropas que sobreviven se vuelven veteranas', () => {
    const r = createRegime(new Random(1));
    expect(veteranLevel(r, 'soldier')).toBe(0);
    for (let i = 0; i < 3; i++) applyRiotResult(r, { ...base, survivors: { soldier: 10 } }, RIOTS.chalecos);
    expect(veteranLevel(r, 'soldier')).toBeGreaterThan(0);
  });

  it('abusar de los colectivos acaba en un escándalo', () => {
    let scandal = false;
    for (let seed = 1; seed <= 10 && !scandal; seed++) {
      const r = createRegime(new Random(seed));
      applyRiotResult(r, { ...base, colectivosUsed: 6 }, RIOTS.chalecos);
      const report = endDay(r, null, new Random(seed));
      scandal = report.notes.some((n) => n.includes('colectivos'));
    }
    expect(scandal).toBe(true);
  });

  it('cumplir el objetivo secundario da recompensa y ceder a una exigencia tiene coste', () => {
    const a = createRegime(new Random(1));
    const b = createRegime(new Random(1));
    applyRiotResult(a, base, RIOTS.chalecos);
    applyRiotResult(b, { ...base, objective: 'sinVehiculos', objectiveDone: true }, RIOTS.chalecos);
    expect(b.treasury).toBeGreaterThan(a.treasury);
    const c = createRegime(new Random(1));
    applyRiotResult(c, { ...base, demand: { id: 'pan', accepted: true } }, RIOTS.chalecos);
    expect(c.treasury).toBeLessThan(a.treasury);
  });
});
