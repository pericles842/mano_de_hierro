import { describe, expect, it } from 'vitest';
import { Random } from '../src/core/Random';
import { RIOTS } from '../src/data/riots';
import { NewsFeed, regimeHeadlines, riotHeadline } from '../src/news/NewsFeed';
import { applyRiotResult, createRegime, declareEmergency, endDay } from '../src/sim/regime';
import { PREP_TIME, RiotSim, type RiotConfig } from '../src/sim/riot/RiotSim';
import { makeStock } from './helpers';

function sim(over: Partial<RiotConfig> = {}): RiotSim {
  return new RiotSim({
    def: RIOTS.chalecos,
    scale: 1,
    stock: makeStock({ soldier: 10, gasser: 4, shotgun: 4, capture: 2, negotiator: 2, army: 6, helicopter: 1, supply: 1, bulldozer: 1 }),
    loyalty: 70,
    unrest: 30,
    seed: 7,
    ...over,
  });
}

function run(s: RiotSim, seconds: number, onStep?: () => void): void {
  for (let t = 0; t < seconds && !s.result; t += 1 / 30) {
    s.step(1 / 30);
    onStep?.();
  }
}

describe('unidades especiales', () => {
  it('el granadero lanza gas, gasta munición y crea nubes', () => {
    const s = sim();
    const g = s.deploy('gasser', 0, 10)!;
    run(s, PREP_TIME + 20);
    expect(g.ammo).toBeLessThan(g.maxAmmo);
    expect(s.harshness).toBeGreaterThan(0);
  });

  it('el escopetero dispara y enfurece a la multitud', () => {
    const calm = sim();
    const angry = sim();
    angry.deploy('shotgun', 0, 12);
    angry.deploy('shotgun', 4, 12);
    run(calm, PREP_TIME + 25);
    run(angry, PREP_TIME + 25);
    expect(angry.anger).toBeGreaterThan(calm.anger);
  });

  it('el equipo de captura arresta líderes', () => {
    const s = sim({ def: RIOTS.huelga });
    s.deploy('capture', 0, 5);
    s.deploy('capture', -8, 5);
    run(s, PREP_TIME + 60);
    expect(s.arrests).toBeGreaterThan(0);
  });

  it('el negociador calma a la gente si no hay perdigones', () => {
    const s = sim({ unrest: 80 });
    const start = s.anger;
    s.deploy('negotiator', 0, 14);
    s.deploy('negotiator', 5, 14);
    run(s, PREP_TIME + 40);
    expect(s.anger).toBeLessThan(start);
  });

  it('el helicóptero vuela: no bloquea a nadie y las piedras no le llegan', () => {
    const s = sim({ unrest: 90 });
    const heli = s.deploy('helicopter', 0, 10)!;
    run(s, PREP_TIME + 40);
    expect(heli.integrity).toBe(heli.maxIntegrity);
  });

  it('el camión de suministros recarga munición', () => {
    const s = sim();
    const g = s.deploy('gasser', 0, 10)!;
    s.deploy('supply', 3, 6);
    g.ammo = 0;
    run(s, 5);
    expect(g.ammo).toBeGreaterThan(0);
  });
});

describe('ejército y lealtad', () => {
  it('con lealtad alta el ejército obedece', () => {
    const s = sim({ loyalty: 90 });
    for (let x = -12; x <= 12; x += 4) s.deploy('army', x, 0);
    let refusals = 0;
    run(s, 90, () => (refusals += s.events.filter((e) => e.type === 'refuse' || e.type === 'desert').length));
    expect(refusals).toBe(0);
  });

  it('con lealtad muy baja hay soldados que se niegan o desertan', () => {
    const s = sim({ loyalty: 10 });
    for (let x = -12; x <= 12; x += 4) s.deploy('army', x, 0);
    let problems = 0;
    run(s, 110, () => (problems += s.events.filter((e) => e.type === 'refuse' || e.type === 'desert').length));
    expect(problems).toBeGreaterThan(0);
  });

  it('el Estado de Excepción da pelotones por un día y tiene coste', () => {
    const st = createRegime(new Random(1));
    const before = st.intlPressure;
    expect(declareEmergency(st)).not.toBeNull();
    expect(declareEmergency(st)).toBeNull();
    expect(st.stock.army).toBeGreaterThan(0);
    expect(st.intlPressure).toBeGreaterThan(before);
    endDay(st, null, new Random(2));
    expect(st.stock.army).toBe(0);
    expect(st.emergency).toBe(false);
  });

  it('usar al ejército y agredir a la prensa sube la presión internacional', () => {
    const base = {
      won: true, reason: 'time' as const, total: 100, dispersed: 50, elapsed: 100, avgForce: 0, tanquetas: 0,
      brokenUnits: 0, palaceHp: 90, peakStage: 0 as const, finalAnger: 0.2, arrests: 0, pressIncidents: 0,
      armyDeployed: 0, deserted: 0, harshness: 0,
    };
    const a = createRegime(new Random(1));
    const b = createRegime(new Random(1));
    applyRiotResult(a, base, RIOTS.chalecos);
    applyRiotResult(b, { ...base, armyDeployed: 3, pressIncidents: 2 }, RIOTS.chalecos);
    expect(b.intlPressure).toBeGreaterThan(a.intlPressure);
  });
});

describe('noticiero', () => {
  it('genera titulares de los dos canales según el estado del país', () => {
    const st = createRegime(new Random(1));
    st.unrest = 80;
    st.intlPressure = 70;
    const items = regimeHeadlines(st, new Random(3));
    expect(items.some((i) => i.source === 'oficial')).toBe(true);
    expect(items.some((i) => i.source === 'internacional' && i.text.includes('ONU'))).toBe(true);
  });

  it('las noticias de última hora salen primero y no se repiten seguidas', () => {
    const feed = new NewsFeed(new Random(1));
    feed.refresh(createRegime(new Random(1)));
    const headline = riotHeadline({ type: 'desert', x: 0, z: 0 }, RIOTS.pan, 'Ciudad Pompón')!;
    feed.pushBreaking(headline[0], headline[1]);
    feed.pushBreaking(headline[0], headline[1]);
    const first = feed.next();
    expect(first.breaking).toBe(true);
    expect(feed.next().breaking).not.toBe(true);
  });
});

describe('diplomacia', () => {
  it('cada acción se usa una vez por día y aplica sus efectos', async () => {
    const { useDiplomacy } = await import('../src/sim/regime');
    const st = createRegime(new Random(1));
    st.intlPressure = 40;
    st.treasury = 1000;
    expect(useDiplomacy(st, 'cumbre')).not.toBeNull();
    expect(st.intlPressure).toBe(32);
    expect(st.treasury).toBe(700);
    expect(useDiplomacy(st, 'cumbre')).toBeNull();
    endDay(st, null, new Random(2));
    expect(st.diplomacyUsed).toEqual([]);
  });

  it('con sanciones fuertes nadie quiere comerciar', async () => {
    const { useDiplomacy } = await import('../src/sim/regime');
    const st = createRegime(new Random(1));
    st.intlPressure = 80;
    expect(useDiplomacy(st, 'comercio')).toBeNull();
  });
});
