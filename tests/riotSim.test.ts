import { describe, expect, it } from 'vitest';
import { RIOTS, type RiotDef } from '../src/data/riots';
import { makeStock } from './helpers';
import { PREP_TIME, RiotSim } from '../src/sim/riot/RiotSim';

const STOCK = makeStock({ soldier: 20, shield: 6, barricade: 6, ballena: 1, tanqueta: 1 });

function makeSim(seed = 1, def: RiotDef = RIOTS.cacerolazo, unrest = 20): RiotSim {
  return new RiotSim({ def, scale: 1, stock: { ...STOCK }, loyalty: 70, unrest, seed });
}

function run(sim: RiotSim, seconds: number): void {
  for (let t = 0; t < seconds && !sim.result; t += 1 / 30) sim.step(1 / 30);
}

describe('RiotSim', () => {
  it('empieza con una concentración que no avanza hasta que arranca la marcha', () => {
    const sim = makeSim();
    expect(sim.protesters.length).toBeGreaterThan(0);
    run(sim, PREP_TIME - 1);
    expect(sim.marchStarted).toBe(false);
    expect(sim.protesters.every((p) => p.state === 'gathering')).toBe(true);
    expect(Math.min(...sim.protesters.map((p) => p.z))).toBeGreaterThan(28);
    run(sim, 2);
    expect(sim.marchStarted).toBe(true);
  });

  it('genera a todos los manifestantes en oleadas', () => {
    const sim = makeSim();
    run(sim, sim.duration * 0.7);
    expect(sim.spawned).toBe(sim.total);
  });

  it('sin defensas, la multitud toma el palacio', () => {
    const sim = makeSim(3, RIOTS.pan);
    run(sim, 300);
    expect(sim.result?.won).toBe(false);
    expect(sim.result?.reason).toBe('palace');
  });

  it('valida el despliegue: stock, zona y solapamiento', () => {
    const sim = makeSim();
    expect(sim.canDeploy('soldier', 0, 0)).toBe(true);
    expect(sim.canDeploy('soldier', 0, -25)).toBe(false); // dentro del palacio
    expect(sim.canDeploy('soldier', 40, 0)).toBe(false); // fuera de la plaza
    sim.deploy('tanqueta', 0, 0);
    expect(sim.available.tanqueta).toBe(0);
    expect(sim.canDeploy('tanqueta', 5, 5)).toBe(false); // sin stock
    expect(sim.canDeploy('soldier', 0.5, 0)).toBe(false); // encima de otra unidad
  });

  it('una línea de defensa protege el palacio', () => {
    const sim = makeSim(5);
    for (let x = -14; x <= 14; x += 4) sim.deploy('shield', x, -8);
    for (let x = -12; x <= 12; x += 3) sim.deploy('soldier', x, -11);
    run(sim, 400);
    expect(sim.result?.won).toBe(true);
    expect(sim.result!.dispersed).toBeGreaterThan(0);
  });

  it('la mano dura escala la protesta y arma a la gente', () => {
    const sim = makeSim(9);
    expect(sim.stage).toBe(0);
    for (let x = -14; x <= 14; x += 4) sim.deploy('shield', x, -8);
    sim.setForce(3);
    run(sim, 60);
    expect(sim.stage).toBeGreaterThanOrEqual(2);
    expect(sim.protesters.some((p) => p.weapon !== 'none')).toBe(true);
  });

  it('la contención calma una protesta tensa', () => {
    const sim = makeSim(4, RIOTS.chalecos, 70);
    const start = sim.anger;
    run(sim, 60);
    expect(sim.anger).toBeLessThan(start);
  });

  it('la molestia social del país hace que lleguen más enfadados', () => {
    expect(makeSim(1, RIOTS.cacerolazo, 90).anger).toBeGreaterThan(makeSim(1, RIOTS.cacerolazo, 0).anger);
  });

  it('más fuerza dispersa más rápido', () => {
    const play = (force: number): RiotSim => {
      const sim = makeSim(9);
      for (let x = -14; x <= 14; x += 4) sim.deploy('shield', x, -8);
      sim.setForce(force);
      run(sim, 80);
      return sim;
    };
    expect(play(3).dispersed).toBeGreaterThan(play(0).dispersed);
  });

  it('es determinista con la misma semilla', () => {
    const a = makeSim(42);
    const b = makeSim(42);
    run(a, 40);
    run(b, 40);
    expect(a.protesters.map((p) => p.x)).toEqual(b.protesters.map((p) => p.x));
  });
});
