import type { Random } from '../core/Random';
import { CAMPAIGN_DAYS, DEFAULT_NAMES } from '../data/country';
import { DIPLOMACY, diplomacyBlocked, type DiplomacyId } from '../data/diplomacy';
import { EVENTS, type EventOption, type GameEventDef } from '../data/events';
import { RIOTS, RIOT_LIST, type RiotDef, type RiotId } from '../data/riots';
import { UNITS, UNIT_ORDER, type UnitType } from '../data/units';
import { UPGRADES, type UpgradeId } from '../data/upgrades';
import type { RiotResult } from './riot/types';

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
  /** Eventos recientes, para no repetirlos seguidos. */
  recentEvents: string[];
  activeRiots: RiotInstance[];
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
      bulldozer: 0,
      helicopter: 0,
      supply: 0,
      army: 0,
    },
    upgrades: [],
    emergency: false,
    diplomacyUsed: [],
    recentEvents: [],
    activeRiots: [],
    status: 'playing',
    nextRiotUid: 1,
  };
  rollRiots(state, rng);
  return state;
}

export function buyUnit(state: RegimeState, type: UnitType): boolean {
  const price = UNITS[type].price;
  if (state.treasury < price) return false;
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
  if (state.upgrades.includes(id) || state.treasury < price) return false;
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

/** Consecuencias de una revuelta en los indicadores del régimen. */
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
    d.popularity -= 12;
    d.intlPressure += result.avgForce * 3 * sens;
    d.loyalty -= 8;
    d.treasury -= 250;
    d.unrest += 6 + result.avgForce * 5; // una victoria del pueblo envalentona a todos
  }
  // Métodos usados: arrestos, gas/perdigones, ejército y lo que grabó la prensa.
  d.unrest += result.arrests * 1.5 + result.harshness * 0.1 + result.armyDeployed * 1;
  d.intlPressure += (result.pressIncidents * 2 + result.armyDeployed * 4 + result.harshness * 0.05) * sens;
  d.popularity -= result.pressIncidents * 0.5;
  d.loyalty -= result.deserted * 3;
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
  if (state.upgrades.includes('propaganda')) {
    d.unrest -= 2;
    d.popularity += 1;
  }
  if (sanctionsFactor(state) < 1) notes.push('Las sanciones internacionales recortan tus ingresos.');
  if (state.unrest > 60) notes.push('La molestia social es altísima: las protestas llegarán armadas y furiosas.');

  applyDeltas(state, d);
  if (state.treasury < 0) {
    state.loyalty = clamp(state.loyalty - 10, 0, 100);
    d.loyalty -= 10;
    notes.push('Arcas vacías: los soldados no cobran este mes.');
  }

  state.day++;
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
  const pool = RIOT_LIST.filter((r) => r.minDay <= state.day);
  const extra = (state.popularity < 40 ? 1 : 0) + (state.unrest > 55 ? 1 : 0);
  const count = Math.min(pool.length, 2 + extra);
  const scale = 1 + (state.day - 1) * 0.05 + (state.popularity < 30 ? 0.2 : 0) + state.unrest / 250;
  state.activeRiots = rng
    .shuffle(pool)
    .slice(0, count)
    .map((def) => ({ uid: state.nextRiotUid++, defId: def.id, scale }));
}

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
