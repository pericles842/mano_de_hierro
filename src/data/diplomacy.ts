/** Acciones diplomáticas: cada una se puede usar una vez por día. */
export type DiplomacyId = 'cumbre' | 'lobby' | 'onu' | 'aliado' | 'comercio';

export interface DiplomacyAction {
  id: DiplomacyId;
  icon: string;
  name: string;
  description: string;
  effects: { treasury?: number; popularity?: number; intlPressure?: number; loyalty?: number; unrest?: number };
  /** Solo disponible si la presión internacional supera este valor. */
  minPressure?: number;
}

export const DIPLOMACY: readonly DiplomacyAction[] = [
  {
    id: 'cumbre',
    icon: '🤝',
    name: 'Cumbre de buena voluntad',
    description: 'Invitas a diplomáticos a una cena de gala en el palacio. Mucho caviar, pocas promesas.',
    effects: { treasury: -300, intlPressure: -8 },
  },
  {
    id: 'lobby',
    icon: '💼',
    name: 'Contratar un lobby internacional',
    description: 'Una agencia de imagen convence al mundo de que Pomposia es «un paraíso con bigote».',
    effects: { treasury: -500, intlPressure: -12 },
  },
  {
    id: 'comercio',
    icon: '🚢',
    name: 'Firmar un acuerdo comercial',
    description: 'Exportas bananos a cambio de dinero y sonrisas. Solo si el mundo todavía te habla.',
    effects: { treasury: 450, popularity: 2 },
  },
  {
    id: 'onu',
    icon: '📣',
    name: 'Denunciar al imperio en la ONU',
    description: 'Un discurso incendiario de 4 horas. Tu pueblo aplaude; los diplomáticos, no.',
    effects: { popularity: 4, intlPressure: 6 },
  },
  {
    id: 'aliado',
    icon: '🐻',
    name: 'Pedir ayuda a un aliado autoritario',
    description: 'Un régimen amigo envía dinero... y asesores con gafas oscuras.',
    effects: { treasury: 650, intlPressure: 7, loyalty: 3 },
  },
];

/** El comercio se cierra cuando la presión internacional es muy alta. */
export function diplomacyBlocked(action: DiplomacyAction, intlPressure: number): string | null {
  if (action.minPressure !== undefined && intlPressure < action.minPressure) return 'Ahora mismo no tiene sentido.';
  if (action.id === 'comercio' && intlPressure > 55) return 'Con estas sanciones nadie quiere comerciar contigo.';
  return null;
}

/** Estatus internacional del régimen según la presión. */
export function internationalStatus(intlPressure: number): { icon: string; name: string; tone: 'good' | 'neutral' | 'bad' } {
  if (intlPressure > 60) return { icon: '🔴', name: 'Paria internacional', tone: 'bad' };
  if (intlPressure > 35) return { icon: '🟠', name: 'Bajo sanciones', tone: 'bad' };
  if (intlPressure > 15) return { icon: '🟡', name: 'Bajo vigilancia', tone: 'neutral' };
  return { icon: '🟢', name: 'Respetable (casi)', tone: 'good' };
}
