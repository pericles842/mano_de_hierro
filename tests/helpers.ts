import { UNIT_ORDER, type UnitType } from '../src/data/units';

/** Stock con todas las unidades a 0 salvo las indicadas. */
export function makeStock(over: Partial<Record<UnitType, number>>): Record<UnitType, number> {
  const stock = Object.fromEntries(UNIT_ORDER.map((t) => [t, 0])) as Record<UnitType, number>;
  return { ...stock, ...over };
}
