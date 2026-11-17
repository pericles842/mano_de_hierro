export type UnitType = 'soldier' | 'shield' | 'barricade' | 'ballena' | 'tanqueta';

export interface UnitDef {
  type: UnitType;
  name: string;
  icon: string;
  description: string;
  /** Precio de compra en el despacho. */
  price: number;
  /** Coste diario por unidad en el arsenal (multiplicado por el nivel de sueldo). */
  upkeep: number;
  /** Colisión: segmento de media longitud `halfLength` sobre el eje local `axis`, con grosor `radius`. */
  radius: number;
  halfLength: number;
  axis: 'x' | 'z';
  /** Separación entre tropas al colocar una hilera (las barricadas quedan pegadas, sin huecos). */
  rowSpacing: number;
  speed: number;
  /** Distancia a la que empuja/dispersa manifestantes. */
  pushRadius: number;
  /** Resolución que quita por segundo a cada manifestante en su radio. */
  dispersal: number;
  integrity: number;
  fearAura?: number;
  water?: number;
  sprayRange?: number;
  intlPressureOnDeploy?: number;
}

export const UNIT_ORDER: readonly UnitType[] = ['soldier', 'shield', 'barricade', 'ballena', 'tanqueta'];

export const UNITS: Record<UnitType, UnitDef> = {
  soldier: {
    type: 'soldier',
    name: 'Antidisturbios',
    icon: '👮',
    description: 'Barato y ágil. Empuja y dispersa a corta distancia.',
    price: 60,
    rowSpacing: 1.3,
    upkeep: 6,
    radius: 0.5,
    halfLength: 0,
    axis: 'x',
    speed: 4.5,
    pushRadius: 2.2,
    dispersal: 0.22,
    integrity: 50,
  },
  shield: {
    type: 'shield',
    name: 'Muro de escudos',
    icon: '🛡️',
    description: 'Formación de tres agentes. Lenta pero casi impenetrable.',
    price: 130,
    rowSpacing: 3.7,
    upkeep: 12,
    radius: 0.6,
    halfLength: 1.6,
    axis: 'x',
    speed: 2.6,
    pushRadius: 2,
    dispersal: 0.16,
    integrity: 170,
  },
  barricade: {
    type: 'barricade',
    name: 'Barricada',
    icon: '🚧',
    description: 'Fija. Corta el paso y desvía a la multitud.',
    price: 40,
    rowSpacing: 3.9,
    upkeep: 0,
    radius: 0.5,
    halfLength: 1.75,
    axis: 'x',
    speed: 0,
    pushRadius: 0,
    dispersal: 0,
    integrity: 260,
  },
  ballena: {
    type: 'ballena',
    name: 'Ballena',
    icon: '🐋',
    description: 'Camión hidrante. Dispersa grupos a distancia mientras le quede agua.',
    price: 450,
    rowSpacing: 3,
    upkeep: 25,
    radius: 1.2,
    halfLength: 1.3,
    axis: 'z',
    speed: 3.2,
    pushRadius: 0,
    dispersal: 0,
    integrity: 300,
    water: 40,
    sprayRange: 13,
  },
  tanqueta: {
    type: 'tanqueta',
    name: 'Tanqueta',
    icon: '🚜',
    description: 'Intimida solo con estar. Muy mal vista por la prensa extranjera.',
    price: 800,
    rowSpacing: 3,
    upkeep: 40,
    radius: 1.2,
    halfLength: 1.1,
    axis: 'z',
    speed: 3,
    pushRadius: 2.4,
    dispersal: 0.1,
    integrity: 500,
    fearAura: 10,
    intlPressureOnDeploy: 3,
  },
};
