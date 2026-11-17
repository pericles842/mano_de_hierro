/**
 * Exigencias de la multitud a mitad de la protesta: el jugador decide en el momento
 * si cede (se calman, pero el régimen paga un precio) o se niega (se enfadan).
 */
export type DemandId = 'presos' | 'pan' | 'ministro' | 'elecciones';

export interface DemandDef {
  id: DemandId;
  title: string;
  text: string;
  accept: string;
  refuse: string;
  /** Qué cuesta ceder (se aplica al régimen al terminar la protesta). */
  cost: string;
  effects: { treasury?: number; popularity?: number; loyalty?: number; intlPressure?: number; unrest?: number; releasePrisoners?: number };
}

export const DEMANDS: Record<DemandId, DemandDef> = {
  presos: {
    id: 'presos',
    title: '«¡Libertad para los presos!»',
    text: 'Los líderes exigen por megáfono la liberación de los presos políticos. La plaza entera corea los nombres.',
    accept: 'Liberar a 5 presos',
    refuse: 'Ni uno',
    cost: 'Sueltas hasta 5 presos: baja la presión internacional, pero los generales lo ven como debilidad.',
    effects: { releasePrisoners: 5, intlPressure: -4, loyalty: -3 },
  },
  pan: {
    id: 'pan',
    title: '«¡Pan a precio justo!»',
    text: 'La multitud exige congelar el precio del pan y el transporte. Las ollas suenan más fuerte que nunca.',
    accept: 'Subvencionar el pan (₱250)',
    refuse: 'El mercado manda',
    cost: '₱250 del tesoro; sube algo la popularidad.',
    effects: { treasury: -250, popularity: 3 },
  },
  ministro: {
    id: 'ministro',
    title: '«¡Fuera el ministro!»',
    text: 'Piden la cabeza del Ministro del Interior, «responsable de la represión». Hay pancartas con su cara tachada.',
    accept: 'Destituirlo',
    refuse: 'Ratificarlo en su cargo',
    cost: 'Los generales pierden a un aliado: −5 lealtad militar, +2 popularidad.',
    effects: { loyalty: -5, popularity: 2 },
  },
  elecciones: {
    id: 'elecciones',
    title: '«¡Elecciones libres!»',
    text: 'La oposición pide elecciones con observadores internacionales. La prensa extranjera lo transmite en directo.',
    accept: 'Prometer elecciones (algún día)',
    refuse: 'El pueblo ya votó por mí',
    cost: 'El mundo aplaude (−6 presión internacional, +3 popularidad), pero el ejército se pone nervioso (−8 lealtad).',
    effects: { intlPressure: -6, popularity: 3, loyalty: -8 },
  },
};

export const DEMAND_LIST: readonly DemandId[] = ['presos', 'pan', 'ministro', 'elecciones'];
