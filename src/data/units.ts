export type UnitType =
  | 'soldier'
  | 'shield'
  | 'gasser'
  | 'shotgun'
  | 'moto'
  | 'capture'
  | 'negotiator'
  | 'barricade'
  | 'ballena'
  | 'gastruck'
  | 'tanqueta'
  | 'bulldozer'
  | 'helicopter'
  | 'supply'
  | 'army';

export type UnitCategory = 'policia' | 'vehiculos' | 'ejercito';

export interface UnitDef {
  type: UnitType;
  category: UnitCategory;
  name: string;
  icon: string;
  description: string;
  /** Precio de compra en el despacho (0 = no se compra: llega por decreto). */
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
  /** Infantería: tiene moral y puede retirarse bajo una lluvia de piedras. */
  infantry: boolean;
  fearAura?: number;
  /** Munición máxima (gas, perdigones, salvas). */
  ammo?: number;
  /** Alcance de su habilidad especial. */
  range?: number;
  /** Segundos entre usos de su habilidad. */
  cooldown?: number;
  water?: number;
  sprayRange?: number;
  /** Vuela: no choca con nadie y las piedras no le llegan. */
  flying?: boolean;
  intlPressureOnDeploy?: number;
}

export const UNIT_ORDER: readonly UnitType[] = [
  'soldier',
  'shield',
  'gasser',
  'shotgun',
  'moto',
  'capture',
  'negotiator',
  'barricade',
  'ballena',
  'gastruck',
  'tanqueta',
  'bulldozer',
  'helicopter',
  'supply',
  'army',
];

export const CATEGORY_NAMES: Record<UnitCategory, string> = {
  policia: 'Policía',
  vehiculos: 'Vehículos y defensas',
  ejercito: 'Ejército',
};

const BASE = { halfLength: 0, axis: 'x', infantry: true } as const;

export const UNITS: Record<UnitType, UnitDef> = {
  soldier: {
    ...BASE,
    type: 'soldier',
    category: 'policia',
    name: 'Antidisturbios',
    icon: '👮',
    description: 'Barato y ágil. Empuja y dispersa a corta distancia.',
    price: 60,
    upkeep: 6,
    radius: 0.5,
    rowSpacing: 1.3,
    speed: 4.5,
    pushRadius: 2.2,
    dispersal: 0.22,
    integrity: 50,
  },
  shield: {
    ...BASE,
    type: 'shield',
    category: 'policia',
    name: 'Muro de escudos',
    icon: '🛡️',
    description: 'Formación de tres agentes. Lenta pero casi impenetrable.',
    price: 130,
    upkeep: 12,
    radius: 0.6,
    halfLength: 1.6,
    rowSpacing: 3.7,
    speed: 2.6,
    pushRadius: 2,
    dispersal: 0.16,
    integrity: 170,
  },
  gasser: {
    ...BASE,
    type: 'gasser',
    category: 'policia',
    name: 'Granadero de gas',
    icon: '🧪',
    description: 'Lanza botes de gas lacrimógeno a distancia. La nube dispersa por zona y el viento la arrastra.',
    price: 110,
    upkeep: 9,
    radius: 0.5,
    rowSpacing: 1.4,
    speed: 4,
    pushRadius: 1.6,
    dispersal: 0.1,
    integrity: 45,
    ammo: 8,
    range: 15,
    cooldown: 4,
  },
  shotgun: {
    ...BASE,
    type: 'shotgun',
    category: 'policia',
    name: 'Escopetero',
    icon: '🎯',
    description: 'Perdigones de goma a distancia. Dispersa rapidísimo, pero enfurece a todos.',
    price: 120,
    upkeep: 10,
    radius: 0.5,
    rowSpacing: 1.4,
    speed: 4,
    pushRadius: 1.6,
    dispersal: 0.1,
    integrity: 45,
    ammo: 30,
    range: 11,
    cooldown: 1.2,
  },
  moto: {
    ...BASE,
    type: 'moto',
    category: 'policia',
    name: 'Motorizados',
    icon: '🏍️',
    description: 'Caballería: embisten grupos y los atraviesan, persiguen a los que huyen (los médicos ya no los recuperan) y desmoralizan las oleadas que entran por su calle.',
    price: 150,
    upkeep: 12,
    radius: 0.6,
    halfLength: 0.5,
    axis: 'z',
    rowSpacing: 1.8,
    speed: 9,
    pushRadius: 1.8,
    dispersal: 0.15,
    integrity: 60,
  },
  capture: {
    ...BASE,
    type: 'capture',
    category: 'policia',
    name: 'Equipo de captura',
    icon: '🕶️',
    description: 'Defiende su posición y sale a arrestar líderes cercanos y poco protegidos. Clic derecho sobre un líder para ordenar su captura. Cada preso suma molestia social.',
    price: 140,
    upkeep: 12,
    radius: 0.5,
    rowSpacing: 1.4,
    speed: 5.5,
    pushRadius: 0,
    dispersal: 0,
    integrity: 120,
    range: 8,
  },
  negotiator: {
    ...BASE,
    type: 'negotiator',
    category: 'policia',
    name: 'Negociador',
    icon: '🤝',
    description: 'No usa la fuerza: calma a la gente cercana y la convence de irse a casa. Nadie negocia bajo perdigones.',
    price: 90,
    upkeep: 6,
    radius: 0.45,
    rowSpacing: 1.4,
    speed: 3.5,
    pushRadius: 0,
    dispersal: 0,
    integrity: 30,
    range: 8,
  },
  barricade: {
    ...BASE,
    type: 'barricade',
    category: 'vehiculos',
    infantry: false,
    name: 'Barricada',
    icon: '🚧',
    description: 'Fija. Corta el paso y desvía a la multitud.',
    price: 40,
    upkeep: 0,
    radius: 0.5,
    halfLength: 1.75,
    rowSpacing: 3.9,
    speed: 0,
    pushRadius: 0,
    dispersal: 0,
    integrity: 260,
  },
  ballena: {
    ...BASE,
    type: 'ballena',
    category: 'vehiculos',
    infantry: false,
    name: 'Ballena',
    icon: '🐋',
    description: 'Camión hidrante. Dispersa grupos a distancia mientras le quede agua.',
    price: 450,
    upkeep: 25,
    radius: 1.2,
    halfLength: 1.3,
    axis: 'z',
    rowSpacing: 3,
    speed: 3.2,
    pushRadius: 0,
    dispersal: 0,
    integrity: 300,
    water: 40,
    sprayRange: 13,
  },
  gastruck: {
    ...BASE,
    type: 'gastruck',
    category: 'vehiculos',
    infantry: false,
    name: 'Camión lanzagás',
    icon: '🚚',
    description: 'Artillería de gas: salvas al grupo más numeroso. La gente no quiere cruzar las nubes: sirven de muro. Selecciónalo y pulsa F para apuntar a mano.',
    price: 600,
    upkeep: 30,
    radius: 1.2,
    halfLength: 1.3,
    axis: 'z',
    rowSpacing: 3,
    speed: 3,
    pushRadius: 0,
    dispersal: 0,
    integrity: 280,
    ammo: 6,
    range: 17,
    cooldown: 8,
  },
  tanqueta: {
    ...BASE,
    type: 'tanqueta',
    category: 'vehiculos',
    infantry: false,
    name: 'Tanqueta',
    icon: '🚔',
    description: 'Zona de miedo visible: la gente tranquila que entra se da la vuelta. Atrae las piedras y bombas para proteger a tu infantería. Cada segundo en la plaza sube la presión internacional.',
    price: 800,
    upkeep: 40,
    radius: 1.2,
    halfLength: 1.1,
    axis: 'z',
    rowSpacing: 3,
    speed: 3,
    pushRadius: 2.4,
    dispersal: 0.1,
    integrity: 500,
    fearAura: 10,
    intlPressureOnDeploy: 3,
  },
  bulldozer: {
    ...BASE,
    type: 'bulldozer',
    category: 'vehiculos',
    infantry: false,
    name: 'Topadora',
    icon: '🚜',
    description: 'Muro móvil: barre a la multitud al avanzar, apaga cauchos (es inmune al fuego) y repara las barricadas cercanas.',
    price: 500,
    upkeep: 20,
    radius: 1.3,
    halfLength: 1.2,
    axis: 'z',
    rowSpacing: 3.2,
    speed: 2.5,
    pushRadius: 2.2,
    dispersal: 0.12,
    integrity: 600,
    range: 3,
  },
  helicopter: {
    ...BASE,
    type: 'helicopter',
    category: 'vehiculos',
    infantry: false,
    name: 'Helicóptero',
    icon: '🚁',
    description: 'Reflector que marca líderes (los equipos de captura los persiguen desde lejos), bombardeo de gas cada 12 s, aviso de la próxima oleada y, de noche, tus tropas cercanas rinden más.',
    price: 900,
    upkeep: 45,
    radius: 1.5,
    axis: 'z',
    rowSpacing: 4,
    speed: 7,
    pushRadius: 0,
    dispersal: 0,
    integrity: 400,
    range: 7,
    flying: true,
  },
  supply: {
    ...BASE,
    type: 'supply',
    category: 'vehiculos',
    infantry: false,
    name: 'Camión de suministros',
    icon: '📦',
    description: 'Recarga gas, perdigones y agua a las unidades cercanas, y les sube la moral.',
    price: 300,
    upkeep: 12,
    radius: 1.1,
    halfLength: 1.2,
    axis: 'z',
    rowSpacing: 3,
    speed: 3.5,
    pushRadius: 0,
    dispersal: 0,
    integrity: 200,
    range: 7,
  },
  army: {
    ...BASE,
    type: 'army',
    category: 'ejercito',
    name: 'Pelotón del ejército',
    icon: '🪖',
    description:
      'Solo con Estado de Excepción. La multitud huye al verlos llegar... pero si la lealtad es baja, pueden negarse a actuar o pasarse al otro bando.',
    price: 0,
    upkeep: 0,
    radius: 0.6,
    halfLength: 1.6,
    rowSpacing: 3.7,
    speed: 3.2,
    pushRadius: 2.4,
    dispersal: 0.3,
    integrity: 220,
    fearAura: 12,
    intlPressureOnDeploy: 4,
  },
};

export const BUYABLE_UNITS: readonly UnitType[] = UNIT_ORDER.filter((t) => UNITS[t].price > 0);
