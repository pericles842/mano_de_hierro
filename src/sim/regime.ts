import type { Random } from '../core/Random';
import { CAMPAIGN_DAYS, DEFAULT_NAMES } from '../data/country';
import { DIPLOMACY, diplomacyBlocked, type DiplomacyId } from '../data/diplomacy';
import { EVENTS, type EventOption, type GameEventDef } from '../data/events';
import { FINAL_RIOT, RIOTS, RIOT_LIST, type RiotDef, type RiotId } from '../data/riots';
import { UNITS, UNIT_ORDER, unlockDay, type UnitType } from '../data/units';
import { UPGRADES, type UpgradeId } from '../data/upgrades';
import type { RiotResult } from './riot/types';
import { DEMANDS } from '../data/demands';
import { OBJECTIVES } from '../data/objectives';

export type PayLevel = 0 | 1 | 2;

export const PAY_LEVELS = [
  { name: 'Tacaño', mult: 0.6, loyalty: -4 },
  { name: 'Normal', mult: 1, loyalty: 1 },
  { name: 'Generoso', mult: 1.5, loyalty: 4 },
] as const;

export interface RiotInstance {
  uid: number;
  defId: RiotId;
  scale: number;
}

export type RegimeStatus = 'playing' | 'coup' | 'revolution' | 'victory';

export interface PlayerNames {
  rulerName: string;
  cityName: string;
}

export interface RegimeState extends PlayerNames {
  day: number;
  maxDays: number;
  treasury: number;
  taxRate: number;
  payLevel: PayLevel;
  popularity: number;
  intlPressure: number;
  loyalty: number;
  /** Molestia social (0..100): la gente recuerda la represión. Sube la ira inicial de las protestas. */
  unrest: number;
  stock: Record<UnitType, number>;
  upgrades: UpgradeId[];
  /** Estado de Excepción decretado hoy: el ejército está disponible. */
  emergency: boolean;
  /** Acciones diplomáticas ya usadas hoy. */
  diplomacyUsed: DiplomacyId[];
  /** Presos políticos: moneda de cambio con el exterior, pero tenerlos presos también cuesta. */
  prisoners: number;
  /** Eventos recientes, para no repetirlos seguidos. */
  recentEvents: string[];
  activeRiots: RiotInstance[];
  /** Mártires recientes: la próxima protesta llega más grande y furiosa. Se olvidan poco a poco. */
  martyrs: number;
  /** Cuánto se ha recurrido a los colectivos: cuanto más, más probable que actúen por su cuenta. */
  colectivoHeat: number;
  /** Experiencia de cada tipo de tropa: los supervivientes se vuelven veteranos. */
  unitXp: Record<UnitType, number>;
  status: RegimeStatus;
  nextRiotUid: number;
}

export interface Deltas {
  treasury: number;
  popularity: number;
  intlPressure: number;
  loyalty: number;
  unrest: number;
}

export interface DayReport {
  income: number;
  upkeep: number;
  deltas: Deltas;
  notes: string[];
}

export function createRegime(rng: Random, names: PlayerNames = DEFAULT_NAMES): RegimeState {
  const state: RegimeState = {
    ...names,
    day: 1,
    maxDays: CAMPAIGN_DAYS,
    treasury: 1200,
    taxRate: 0.2,
    payLevel: 1,
    popularity: 55,
    intlPressure: 10,
    loyalty: 65,
    unrest: 20,
    stock: {
      soldier: 14,
      shield: 3,
      gasser: 2,
      shotgun: 0,
      moto: 0,
      capture: 1,
      negotiator: 1,
      barricade: 6,
      ballena: 1,
      gastruck: 0,
      tanqueta: 0,
      supply: 0,
      sniper: 0,
      colectivo: 0,
      army: 0,
    },
    upgrades: [],
    emergency: false,
    diplomacyUsed: [],
    prisoners: 0,
    recentEvents: [],
    activeRiots: [],
    martyrs: 0,
    colectivoHeat: 0,
    unitXp: Object.fromEntries(UNIT_ORDER.map((t) => [t, 0])) as Record<UnitType, number>,
    status: 'playing',
    nextRiotUid: 1,
  };
  rollRiots(state, rng);
  return state;
}

/** Nivel de veteranía (0-3) de un tipo de tropa. */
export function veteranLevel(state: RegimeState, type: UnitType): number {
  return Math.min(3, Math.floor(state.unitXp[type] / XP_PER_LEVEL));
}

export function veteranLevels(state: RegimeState): Partial<Record<UnitType, number>> {
  return Object.fromEntries(UNIT_ORDER.map((t) => [t, veteranLevel(state, t)]));
}

export function buyUnit(state: RegimeState, type: UnitType): boolean {
  const price = UNITS[type].price;
  if (state.treasury < price || state.day < unlockDay(type)) return false;
  state.treasury -= price;
  state.stock[type]++;
  return true;
}

export const EMERGENCY_ARMY_SQUADS = 6;
export const EMERGENCY_COST: Deltas = { treasury: 0, popularity: -5, intlPressure: 10, loyalty: 2, unrest: 8 };

/** Decreta el Estado de Excepción por un día: llegan pelotones del ejército, pero el mundo mira. */
export function declareEmergency(state: RegimeState): Deltas | null {
  if (state.emergency) return null;
  state.emergency = true;
  state.stock.army = EMERGENCY_ARMY_SQUADS;
  const d = { ...EMERGENCY_COST };
  applyDeltas(state, d);
  return d;
}

export type ReleaseMode = 'gesto' | 'canje';

/**
 * Efecto de liberar presos políticos.
 * - Gesto de buena voluntad: baja mucho la presión internacional y la molestia, pero los generales lo ven como debilidad.
 * - Canje: los cambias por ayuda económica y algo de alivio diplomático.
 */
export function releaseEffects(n: number, mode: ReleaseMode): Deltas {
  if (mode === 'canje') {
    return { treasury: n * 45, popularity: 0, intlPressure: -n * 0.6, loyalty: -n * 0.1, unrest: -n * 0.2 };
  }
  return { treasury: 0, popularity: n * 0.2, intlPressure: -n * 1.2, loyalty: -n * 0.25, unrest: -n * 0.5 };
}

export function releasePrisoners(state: RegimeState, count: number, mode: ReleaseMode): Deltas | null {
  const n = Math.floor(Math.min(count, state.prisoners));
  if (n <= 0) return null;
  const d = releaseEffects(n, mode);
  state.prisoners -= n;
  applyDeltas(state, d);
  checkStatus(state);
  return d;
}

/** MODO DEVELOPER (temporal): tropas y dinero de sobra para probar. */
export function devUnlock(state: RegimeState): void {
  for (const type of UNIT_ORDER) state.stock[type] = Math.max(state.stock[type], 30);
  state.treasury = Math.max(state.treasury, 99999);
  state.emergency = true;
}

/** Usa una acción diplomática (una vez por día). Devuelve los cambios, o null si no se puede. */
export function useDiplomacy(state: RegimeState, id: DiplomacyId): Deltas | null {
  const action = DIPLOMACY.find((a) => a.id === id);
  if (!action || state.diplomacyUsed.includes(id) || diplomacyBlocked(action, state.intlPressure)) return null;
  const e = action.effects;
  if (e.treasury !== undefined && e.treasury < 0 && state.treasury < -e.treasury) return null;
  const d: Deltas = {
    treasury: e.treasury ?? 0,
    popularity: e.popularity ?? 0,
    intlPressure: e.intlPressure ?? 0,
    loyalty: e.loyalty ?? 0,
    unrest: e.unrest ?? 0,
  };
  state.diplomacyUsed.push(id);
  applyDeltas(state, d);
  checkStatus(state);
  return d;
}

export function buyUpgrade(state: RegimeState, id: UpgradeId): boolean {
  const price = UPGRADES[id].price;
  const req = UPGRADES[id].requires;
  if (state.upgrades.includes(id) || state.treasury < price || (req && !state.upgrades.includes(req))) return false;
  state.treasury -= price;
  state.upgrades.push(id);
  return true;
}

/** Evento del despacho para el nuevo día (o null si hoy no pasa nada). */
export function rollEvent(state: RegimeState, rng: Random): GameEventDef | null {
  if (!rng.chance(0.65)) return null;
  const pool = EVENTS.filter((e) => !state.recentEvents.includes(e.id) && (e.condition?.(state) ?? true));
  if (pool.length === 0) return null;
  const event = rng.pick(pool);
  state.recentEvents = [event.id, ...state.recentEvents].slice(0, 4);
  return event;
}

export function applyEventOption(state: RegimeState, option: EventOption): Deltas {
  const e = option.effects;
  const d: Deltas = {
    treasury: e.treasury ?? 0,
    popularity: e.popularity ?? 0,
    intlPressure: e.intlPressure ?? 0,
    loyalty: e.loyalty ?? 0,
    unrest: e.unrest ?? 0,
  };
  applyDeltas(state, d);
  for (const type of UNIT_ORDER) state.stock[type] = Math.max(0, state.stock[type] + (e.stock?.[type] ?? 0));
  return d;
}

export function setTaxRate(state: RegimeState, rate: number): void {
  state.taxRate = clamp(Math.round(rate * 100) / 100, 0, 0.6);
}

export function setPayLevel(state: RegimeState, level: PayLevel): void {
  state.payLevel = level;
}

export function sanctionsFactor(state: RegimeState): number {
  if (state.intlPressure > 60) return 0.6;
  if (state.intlPressure > 35) return 0.85;
  return 1;
}

export function projectedIncome(state: RegimeState): number {
  return Math.round(1800 * state.taxRate * (0.6 + state.popularity / 250) * sanctionsFactor(state));
}

export function projectedUpkeep(state: RegimeState): number {
  const mult = PAY_LEVELS[state.payLevel].mult;
  let total = 0;
  for (const type of UNIT_ORDER) total += state.stock[type] * UNITS[type].upkeep;
  return Math.round(total * mult);
}

/**
 * Consecuencias de una revuelta en los indicadores del régimen.
 * Solo se aplica cuando la revuelta termina en victoria o cuando el jugador acepta la derrota;
 * perder el palacio permite reintentar gratis.
 */
export function applyRiotResult(state: RegimeState, result: RiotResult, def: RiotDef): Deltas {
  const d = zeroDeltas();
  const sens = def.intlSensitivity;
  if (result.won) {
    d.popularity += 3 - result.avgForce * 2.5 * sens;
    d.intlPressure += (result.avgForce * 4 + result.tanquetas * 3) * sens;
    d.loyalty += result.avgForce > 2.5 ? -6 : 3;
    d.treasury -= result.brokenUnits * 20;
    d.unrest += result.avgForce * 7 + result.tanquetas * 2 + result.peakStage * 2 - 5;
  } else {
    // Cuanto más tiempo estuvo tomado el palacio, peor.
    const occupied = Math.min(60, result.occupiedSeconds);
    d.popularity -= 6 + occupied * 0.15;
    d.intlPressure += result.avgForce * 3 * sens;
    d.loyalty -= 5 + occupied * 0.08;
    d.treasury -= 120 + occupied * 4;
    d.unrest += 5 + result.avgForce * 5 + occupied * 0.1; // una victoria del pueblo envalentona a todos
  }
  if (result.won && result.palaceFallen) {
    // Lo recuperaste, pero las imágenes del palacio tomado dieron la vuelta al mundo.
    d.popularity -= 3;
    d.loyalty -= 2;
  }
  // Muertos: los derechos humanos no salen gratis. Un líder asesinado se convierte en mártir.
  if (result.deaths > 0) {
    d.intlPressure += (result.deaths * 1.2 + result.leadersKilled * 3 + (result.deaths >= 10 ? 10 : 0)) * sens;
    d.unrest += result.deaths * 0.7 + result.leadersKilled * 3;
    d.popularity -= result.deaths * 0.35 + result.leadersKilled;
  }
  d.loyalty -= result.soldiersKilled * 1.5; // las tropas no quieren morir por ti
  d.intlPressure += result.tanquetaSeconds * 0.03 * sens;
  state.prisoners += result.arrests;
  // Métodos usados: arrestos, gas/perdigones, ejército y lo que grabó la prensa.
  d.unrest += result.arrests * 1.5 + result.harshness * 0.1 + result.armyDeployed * 1;
  d.intlPressure += (result.pressIncidents * 2 + result.armyDeployed * 4 + result.harshness * 0.05) * sens;
  d.popularity -= result.pressIncidents * 0.5;
  d.loyalty -= result.deserted * 3;
  // Memoria: los muertos se convierten en mártires; los colectivos dejan huella; los supervivientes aprenden.
  state.martyrs += result.leadersKilled * 2 + Math.floor(result.deaths / 4);
  state.colectivoHeat += result.colectivosUsed ?? 0;
  for (const [type, n] of Object.entries(result.survivors ?? {}) as [UnitType, number][]) {
    if (type !== 'barricade' && type !== 'army') state.unitXp[type] += n;
  }
  // Objetivo secundario cumplido: recompensa.
  if (result.objective && result.objectiveDone) {
    const r = OBJECTIVES[result.objective].reward;
    d.treasury += r.treasury ?? 0;
    d.loyalty += r.loyalty ?? 0;
    d.popularity += r.popularity ?? 0;
  }
  // Cediste a una exigencia: el régimen paga el precio.
  if (result.demand?.accepted) {
    const e = DEMANDS[result.demand.id].effects;
    d.treasury += e.treasury ?? 0;
    d.popularity += e.popularity ?? 0;
    d.loyalty += e.loyalty ?? 0;
    d.intlPressure += e.intlPressure ?? 0;
    d.unrest += e.unrest ?? 0;
    if (e.releasePrisoners) state.prisoners = Math.max(0, state.prisoners - e.releasePrisoners);
  }
  applyDeltas(state, d);
  return d;
}

/** Cierra el día: economía, revueltas ignoradas, deriva de indicadores y nuevas revueltas. */
export function endDay(state: RegimeState, handledUid: number | null, rng: Random): DayReport {
  const d = zeroDeltas();
  const notes: string[] = [];

  for (const riot of state.activeRiots) {
    if (riot.uid === handledUid) continue;
    d.popularity -= 4;
    d.treasury -= 60;
    d.unrest += 3;
    notes.push(`${RIOTS[riot.defId].name} sigue activa: daños y descontento.`);
  }

  const income = projectedIncome(state);
  const upkeep = projectedUpkeep(state);
  d.treasury += income - upkeep;
  d.popularity += (0.2 - state.taxRate) * 25 + 0.5;
  d.loyalty += PAY_LEVELS[state.payLevel].loyalty;
  d.intlPressure -= 2;
  d.unrest += (state.taxRate - 0.2) * 30 - 2;
  if (state.prisoners > 0) {
    // Tener presos políticos tiene un coste diario: ONG, familias y prensa no paran.
    d.intlPressure += Math.min(8, state.prisoners * 0.15);
    d.unrest += Math.min(5, state.prisoners * 0.1);
    if (state.prisoners >= 10) notes.push(`${state.prisoners} presos políticos: las ONG exigen su liberación.`);
  }
  if (state.upgrades.includes('propaganda')) {
    d.unrest -= 2;
    d.popularity += 1;
  }
  if (sanctionsFactor(state) < 1) notes.push('Las sanciones internacionales recortan tus ingresos.');
  // Mártires: la próxima protesta llega más grande y furiosa. Se olvidan poco a poco.
  if (state.martyrs > 0) {
    notes.push(`🕯️ Velas por los mártires en cada esquina: la próxima protesta llegará más grande y furiosa.`);
    d.unrest += Math.min(4, state.martyrs * 0.5);
  }
  // Colectivos: si los usas mucho, un día actúan por su cuenta.
  if (state.colectivoHeat >= 3 && rng.chance(Math.min(0.6, state.colectivoHeat * 0.1))) {
    d.intlPressure += 6;
    d.unrest += 4;
    d.popularity -= 3;
    state.colectivoHeat = Math.max(0, state.colectivoHeat - 2);
    notes.push('🏴 Los colectivos actuaron por su cuenta esta noche: asaltaron un barrio opositor. Las imágenes dan la vuelta al mundo.');
  }
  if (state.unrest > 60) notes.push('La molestia social es altísima: las protestas llegarán armadas y furiosas.');

  applyDeltas(state, d);
  if (state.treasury < 0) {
    state.loyalty = clamp(state.loyalty - 10, 0, 100);
    d.loyalty -= 10;
    notes.push('Arcas vacías: los soldados no cobran este mes.');
  }

  state.day++;
  state.martyrs = Math.max(0, state.martyrs - 1);
  state.colectivoHeat = Math.max(0, state.colectivoHeat - 0.5);
  const story = STORY[state.day];
  if (story) notes.push(story);
  const unlocked = UNIT_ORDER.filter((t) => unlockDay(t) === state.day).map((t) => `${UNITS[t].icon} ${UNITS[t].name}`);
  if (unlocked.length > 0) notes.push(`🔓 Nuevo en el despacho: ${unlocked.join(', ')}.`);
  state.emergency = false;
  state.stock.army = 0;
  state.diplomacyUsed = [];
  checkStatus(state);
  state.activeRiots = [];
  if (state.status === 'playing') rollRiots(state, rng);
  return { income, upkeep, deltas: d, notes };
}

export function checkStatus(state: RegimeState): void {
  if (state.loyalty <= 0) state.status = 'coup';
  else if (state.popularity <= 0) state.status = 'revolution';
  else if (state.day > state.maxDays) state.status = 'victory';
}

function rollRiots(state: RegimeState, rng: Random): void {
  // Último día: la Gran Marcha, sola.
  if (state.day === state.maxDays) {
    const scale = 1 + state.unrest / 200 + state.martyrs * 0.05;
    state.activeRiots = [{ uid: state.nextRiotUid++, defId: FINAL_RIOT, scale }];
    return;
  }
  const pool = RIOT_LIST.filter((r) => r.minDay <= state.day);
  const extra = (state.popularity < 40 ? 1 : 0) + (state.unrest > 55 ? 1 : 0);
  const count = Math.min(pool.length, 2 + extra);
  const scale = 1 + (state.day - 1) * 0.05 + (state.popularity < 30 ? 0.2 : 0) + state.unrest / 250 + Math.min(0.3, state.martyrs * 0.06);
  state.activeRiots = rng
    .shuffle(pool)
    .slice(0, count)
    .map((def) => ({ uid: state.nextRiotUid++, defId: def.id, scale }));
}

/** Experiencia por nivel de veteranía. */
const XP_PER_LEVEL = 12;

/** La crisis escala a lo largo del mandato: titulares que abren ciertos días. */
const STORY: Record<number, string> = {
  4: '📰 La oposición, antes dispersa, empieza a coordinarse por redes sociales.',
  7: '📰 Los sindicatos amenazan con una huelga general. Las protestas serán más grandes.',
  10: '📰 Huelga general convocada: el país se paraliza. Aparecen los primeros grupos armados.',
  13: '📰 Las embajadas extranjeras recomiendan a sus ciudadanos salir del país.',
  14: '📰 Mañana, último día del mandato, la oposición convoca «La Gran Marcha» hacia el palacio.',
};

function applyDeltas(state: RegimeState, d: Deltas): void {
  state.treasury = Math.round(state.treasury + d.treasury);
  state.popularity = clamp(state.popularity + d.popularity, 0, 100);
  state.intlPressure = clamp(state.intlPressure + d.intlPressure, 0, 100);
  state.loyalty = clamp(state.loyalty + d.loyalty, 0, 100);
  state.unrest = clamp(state.unrest + d.unrest, 0, 100);
}

function zeroDeltas(): Deltas {
  return { treasury: 0, popularity: 0, intlPressure: 0, loyalty: 0, unrest: 0 };
}

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}
