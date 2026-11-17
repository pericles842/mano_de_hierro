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

export const FORCE_LEVELS: readonly ForceLevel[] = [
  {
    level: 0,
    name: 'Contención',
    icon: '✋',
    description: 'Solo empujar. Lento, pero nadie se queja.',
    dispersalMult: 1,
    angerPerSec: 0,
    knockback: 0,
  },
  {
    level: 1,
    name: 'Gas lacrimógeno',
    icon: '💨',
    description: 'Dispersa más rápido. Algo de mala prensa.',
    dispersalMult: 1.6,
    angerPerSec: 0.006,
    knockback: 0.6,
  },
  {
    level: 2,
    name: 'Perdigones',
    icon: '💥',
    description: 'Muy efectivo. La ira y la presión internacional se disparan.',
    dispersalMult: 2.3,
    angerPerSec: 0.012,
    knockback: 1.2,
  },
  {
    level: 3,
    name: 'Mano dura',
    icon: '✊',
    description: 'Todo vale. Rápido, brutal... y tus tropas empiezan a dudar.',
    dispersalMult: 3.2,
    angerPerSec: 0.02,
    knockback: 2,
  },
];
