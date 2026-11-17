export interface ForceLevel {
  level: number;
  name: string;
  icon: string;
  description: string;
  dispersalMult: number;
  /** Cuánto sube la ira de la multitud por segundo mientras está activo. */
  angerPerSec: number;
  /** Empuje extra (m/s) a los manifestantes en contacto. */
  knockback: number;
}

/**
 * Niveles de fuerza, de menor a mayor. Cada nivel desbloquea armas y conductas:
 * 0 solo empujar · 1 gas y golpes · 2 perdigones y palizas · 3 pistolas (fuego real).
 */
export const FORCE_LEVELS: readonly ForceLevel[] = [
  {
    level: 0,
    name: 'Contención',
    icon: '✋',
    description: 'Solo empujar. Lento, pero nadie se queja. Nadie dispara: ni gas, ni agua, ni perdigones.',
    dispersalMult: 1,
    angerPerSec: 0,
    knockback: 0,
  },
  {
    level: 1,
    name: 'Contención agresiva',
    icon: '💨',
    description: 'Gas lacrimógeno y cañones de agua. Los agentes gritan, empujan, cachean para intimidar y ya golpean.',
    dispersalMult: 1.6,
    angerPerSec: 0.006,
    knockback: 0.6,
  },
  {
    level: 2,
    name: 'Fuerza dispersiva',
    icon: '💥',
    description: 'Perdigones de goma. Antidisturbios y muros de escudos agarran a manifestantes y les dan palizas para echarlos. El ejército, si está en la calle, dispara fuego real.',
    dispersalMult: 2.3,
    angerPerSec: 0.012,
    knockback: 1.2,
  },
  {
    level: 3,
    name: 'Mano dura',
    icon: '☠️',
    description: 'Fuego real: toda la policía saca la pistola y las escopetas cargan munición letal. Habrá muertos.',
    dispersalMult: 3.2,
    angerPerSec: 0.02,
    knockback: 2,
  },
];

/** Nivel mínimo para cada arma o conducta (una sola fuente de verdad). */
export const FORCE_GATES = {
  /** Gas (granaderos, camión lanzagás, helicóptero), agua (ballena), golpes e intimidación. */
  gas: 1,
  /** Perdigones de goma y palizas. */
  rubber: 2,
  /** Pistolas y munición letal de la policía. */
  lethal: 3,
} as const;
