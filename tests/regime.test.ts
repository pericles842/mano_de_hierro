import { describe, expect, it } from 'vitest';
import { Random } from '../src/core/Random';
import { RIOTS } from '../src/data/riots';
import {
  applyRiotResult,
  buyUnit,
  createRegime,
  endDay,
  projectedIncome,
  setTaxRate,
} from '../src/sim/regime';
import type { RiotResult } from '../src/sim/riot/types';

const result = (over: Partial<RiotResult>): RiotResult => ({
  won: true,
  reason: 'time',
  total: 100,
  dispersed: 60,
  elapsed: 100,
  avgForce: 0,
  tanquetas: 0,
  brokenUnits: 0,
  palaceHp: 80,
  peakStage: 0,
  finalAnger: 0.2,
  arrests: 0,
  pressIncidents: 0,
  armyDeployed: 0,
  deserted: 0,
  harshness: 0,
  palaceFallen: false,
  occupiedSeconds: 0,
  deaths: 0,
  injured: 0,
  leadersKilled: 0,
  soldiersKilled: 0,
  tanquetaSeconds: 0,
  ...over,
});

describe('régimen', () => {
  it('empieza con revueltas activas', () => {
    const s = createRegime(new Random(1));
    expect(s.activeRiots.length).toBeGreaterThanOrEqual(2);
    expect(s.status).toBe('playing');
  });

  it('comprar descuenta dinero y suma stock; sin dinero no compra', () => {
    const s = createRegime(new Random(1));
    s.treasury = 100;
    expect(buyUnit(s, 'soldier')).toBe(true);
    expect(s.treasury).toBe(40);
    expect(buyUnit(s, 'tanqueta')).toBe(false);
  });

  it('subir impuestos sube ingresos y baja popularidad', () => {
    const low = createRegime(new Random(1));
    const high = createRegime(new Random(1));
    setTaxRate(high, 0.5);
    expect(projectedIncome(high)).toBeGreaterThan(projectedIncome(low));
    endDay(low, null, new Random(2));
    endDay(high, null, new Random(2));
    expect(high.popularity).toBeLessThan(low.popularity);
  });

  it('la mano dura sube la presión internacional más que la contención', () => {
    const soft = createRegime(new Random(1));
    const hard = createRegime(new Random(1));
    applyRiotResult(soft, result({ avgForce: 0 }), RIOTS.chalecos);
    applyRiotResult(hard, result({ avgForce: 3 }), RIOTS.chalecos);
    expect(hard.intlPressure).toBeGreaterThan(soft.intlPressure);
    expect(hard.loyalty).toBeLessThan(soft.loyalty);
  });

  it('lealtad a cero provoca golpe de Estado', () => {
    const s = createRegime(new Random(1));
    s.loyalty = 2;
    s.payLevel = 0;
    endDay(s, null, new Random(3));
    expect(s.status).toBe('coup');
  });

  it('sobrevivir todos los días es victoria', () => {
    const s = createRegime(new Random(1));
    s.day = s.maxDays;
    endDay(s, s.activeRiots[0].uid, new Random(4));
    expect(s.status).toBe('victory');
  });
});
