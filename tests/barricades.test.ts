import { describe, expect, it } from 'vitest';
import { RIOTS } from '../src/data/riots';
import { PLANNING_TIME, RiotSim } from '../src/sim/riot/RiotSim';
import { makeStock } from './helpers';

function sim(planning = PLANNING_TIME): RiotSim {
  return new RiotSim({
    def: RIOTS.chalecos,
    scale: 1,
    stock: makeStock({ barricade: 3, soldier: 6, negotiator: 1 }),
    loyalty: 70,
    unrest: 30,
    seed: 7,
    planning,
  });
}

describe('barricadas: mover y quitar', () => {
  it('quitar una barricada la devuelve a la reserva', () => {
    const s = sim();
    const b = s.deploy('barricade', 0, 10)!;
    expect(s.available.barricade).toBe(2);
    expect(s.dismantle(b.id)).toBe(true);
    expect(s.units).toHaveLength(0);
    expect(s.available.barricade).toBe(3);
  });

  it('mover una barricada la recoloca y conserva su daño', () => {
    const s = sim();
    const b = s.deploy('barricade', 0, 10)!;
    b.integrity = b.maxIntegrity / 2;
    expect(s.relocate(b.id, 4, 12, Math.PI / 2)).toBe(true);
    expect([b.x, b.z, b.heading]).toEqual([4, 12, Math.PI / 2]);
    expect(b.integrity).toBe(b.maxIntegrity / 2);
    expect(s.available.barricade).toBe(2);
  });

  it('puede moverse un poco sobre su propio sitio, pero no encima de otra tropa', () => {
    const s = sim();
    const b = s.deploy('barricade', 0, 10)!;
    s.deploy('soldier', 6, 10);
    expect(s.relocate(b.id, 0.5, 10, 0)).toBe(true);
    expect(s.relocate(b.id, 6, 10, 0)).toBe(false);
  });

  it('las tropas móviles no se pueden quitar ni recolocar así', () => {
    const s = sim();
    const soldier = s.deploy('soldier', 0, 10)!;
    expect(s.isRelocatable(soldier.id)).toBe(false);
    expect(s.dismantle(soldier.id)).toBe(false);
    expect(s.relocate(soldier.id, 3, 10, 0)).toBe(false);
  });

  it('al terminar la preparación las barricadas quedan fijas', () => {
    const s = sim();
    const b = s.deploy('barricade', 0, 10)!;
    s.startNow();
    expect(s.planning).toBe(false);
    expect(s.dismantle(b.id)).toBe(false);
    expect(s.relocate(b.id, 4, 12, 0)).toBe(false);
    expect(s.units).toHaveLength(1);
  });

  it('sin preparación no se pueden mover nunca', () => {
    const s = sim(0);
    const b = s.deploy('barricade', 0, 10)!;
    expect(s.isRelocatable(b.id)).toBe(false);
  });
});

describe('fase de preparación', () => {
  it('las tropas obedecen órdenes de movimiento durante la preparación', () => {
    const s = sim();
    const u = s.deploy('soldier', 0, 10)!;
    s.orderMove(u.id, 4, 10);
    for (let i = 0; i < 60; i++) s.step(1 / 30);
    expect(u.x).toBeCloseTo(4, 1);
    expect(s.elapsed).toBe(0);
  });

  it('congela la simulación hasta que se acaba el tiempo', () => {
    const s = sim(2);
    const before = s.protesters.map((p) => [p.x, p.z]);
    for (let i = 0; i < 30; i++) s.step(1 / 30); // 1 s de preparación
    expect(s.elapsed).toBe(0);
    expect(s.protesters.map((p) => [p.x, p.z])).toEqual(before);
    for (let i = 0; i < 40; i++) s.step(1 / 30);
    expect(s.planning).toBe(false);
    expect(s.elapsed).toBeGreaterThan(0);
  });

  it('avisa cuando termina, también si se empieza antes de tiempo', () => {
    const s = sim();
    s.startNow();
    s.step(1 / 30);
    expect(s.events.some((e) => e.type === 'planningEnd')).toBe(true);
  });

  it('el negociador se marca hablando cuando tiene público', () => {
    const s = sim(0);
    const n = s.deploy('negotiator', 0, 20)!;
    let talked = false;
    for (let i = 0; i < 30 * 60 && !talked && !s.result; i++) {
      s.step(1 / 30);
      talked = n.talking;
    }
    expect(talked).toBe(true);
  });

  it('los antidisturbios se marcan empujando al contactar con la multitud', () => {
    const s = sim(0);
    const units = [-4, -2, 0, 2, 4].map((x) => s.deploy('soldier', x, 20)!).filter(Boolean);
    let pushed = false;
    for (let i = 0; i < 30 * 90 && !pushed && !s.result; i++) {
      s.step(1 / 30);
      pushed = units.some((u) => u.pushing);
    }
    expect(pushed).toBe(true);
  });
});
