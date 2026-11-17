/** Acciones diplomáticas: cada una se puede usar una vez por día. */
export type DiplomacyId = 'cumbre' | 'presos' | 'lobby' | 'onu' | 'aliado' | 'comercio';

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
    id: 'presos',
    icon: '🕊️',
    name: 'Liberar presos políticos',
    description: 'Gesto de buena voluntad muy aplaudido fuera. Tus generales lo ven como debilidad.',
    effects: { intlPressure: -10, unrest: -4, loyalty: -4 },
    minPressure: 20,
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
  if (action.minPressure !== undefined && intlPressure < action.minPressure) return 'No hay presos que liberar... oficialmente.';
  if (action.id === 'comercio' && intlPressure > 55) return 'Con estas sanciones nadie quiere comerciar contigo.';
  return null;
}
