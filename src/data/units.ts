export type UnitType =
  | 'soldier'
  | 'shield'
  | 'gasser'
  | 'shotgun'
  | 'moto'
  | 'capture'
  | 'negotiator'
  | 'k9'
  | 'sniper'
  | 'colectivo'
  | 'barricade'
  | 'ballena'
  | 'gastruck'
  | 'tanqueta'
  | 'supply'
  | 'army';

export type UnitCategory = 'policia' | 'vehiculos' | 'especiales' | 'ejercito';

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
  /**
   * Cuánto calienta a la multitud mientras está en la calle (ira por segundo).
   * Las tropas agresivas trabajan solas, pero su sola presencia provoca.
   */
  provoke?: number;
  /** Segundos que dura su nube de gas (granadero: corta y frecuente). */
  gasLife?: number;
  /**
   * Presencia intimidante, a cualquier nivel de fuerza: los tranquilos se asustan y pierden ánimo;
   * radicales, escuderos y líderes se enfadan. `byStage` = efecto en cada fase (Pacífica…Caos).
   */
  presence?: { radius: number; strength: number; byStage: readonly [number, number, number, number] };
  /** Oculta por ahora: no aparece en la barra ni en el despacho. */
  hidden?: boolean;
}

/** Francotiradores: se apostan en la azotea del palacio (no se colocan en la plaza). */
export function isRooftop(type: UnitType): boolean {
  return type === 'sniper';
}

/** Vehículos: no se colocan en la preparación; salen de la puerta del palacio durante la protesta. */
export function isVehicle(type: UnitType): boolean {
  return UNITS[type].category === 'vehiculos' && type !== 'barricade';
}

export const UNIT_ORDER: readonly UnitType[] = [
  'soldier',
  'shield',
  'gasser',
  'shotgun',
  'moto',
  'capture',
  'negotiator',
  'k9',
  'sniper',
  'colectivo',
  'barricade',
  'ballena',
  'gastruck',
  'tanqueta',
  'supply',
  'army',
];

export const CATEGORY_NAMES: Record<UnitCategory, string> = {
  policia: 'Policía',
  vehiculos: 'Vehículos y defensas',
  especiales: 'Especiales',
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
    description: 'Barato y ágil. Empuja y dispersa de cerca. Con más fuerza sale a buscar a la gente, golpea, da palizas y en Mano dura saca la pistola.',
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
    description: 'Tres agentes tras un muro de escudos que golpean con ellos. Lenta pero casi impenetrable. Golpea, da palizas y en Mano dura dispara.',
    provoke: 0.0003,
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
    description: 'Desde Contención agresiva lanza botes de gas a distancia: nubes cortas (4 s) cada 2 s. El viento las arrastra.',
    provoke: 0.0004,
    gasLife: 4,
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
    cooldown: 2,
  },
  shotgun: {
    ...BASE,
    type: 'shotgun',
    category: 'policia',
    name: 'Escopetero',
    icon: '🎯',
    description: 'Desde Fuerza dispersiva dispara perdigones de goma a distancia. Dispersa rapidísimo, pero enfurece a todos. En Mano dura, munición letal.',
    provoke: 0.0006,
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
    description: 'Agresivos y por su cuenta: embisten grupos, arrastran a líderes y manifestantes fuera de la plaza y persiguen a los que huyen. Su presencia provoca.',
    provoke: 0.0008,
    price: 150,
    upkeep: 12,
    radius: 0.6,
    halfLength: 0.5,
    axis: 'z',
    rowSpacing: 1.8,
    speed: 9,
    pushRadius: 1.8,
    dispersal: 0.15,
    presence: { radius: 6, strength: 0.06, byStage: [1, 1, 0.5, 0] },
    integrity: 60,
  },
  capture: {
    ...BASE,
    type: 'capture',
    category: 'policia',
    name: 'Equipo de captura',
    icon: '🕶️',
    description: 'Sale solo a cazar: prefiere líderes, luego radicales, luego cualquiera. Clic derecho sobre alguien para ordenar su captura. Cada preso suma molestia social.',
    provoke: 0.0006,
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
  k9: {
    ...BASE,
    type: 'k9',
    category: 'policia',
    name: 'Brigada canina',
    icon: '🐕',
    description: 'Agente con perro. Asusta mucho a la gente tranquila (los radicales se enfurecen) en cualquier fase. Desde Contención agresiva muerde: el mordido cae y huye. Persigue a los que escapan.',
    provoke: 0.0007,
    price: 160,
    upkeep: 12,
    radius: 0.55,
    rowSpacing: 1.6,
    speed: 5,
    pushRadius: 1.6,
    dispersal: 0.15,
    presence: { radius: 6, strength: 0.1, byStage: [1, 1, 1, 0.5] },
    integrity: 60,
    cooldown: 3,
  },
  sniper: {
    ...BASE,
    type: 'sniper',
    category: 'especiales',
    name: 'Francotirador',
    icon: '🎯',
    description: 'Colócalo donde quieras sobre la azotea del palacio: nadie le alcanza. Solo con Mano dura: abate a los armados, luego a los líderes y a los radicales. Cada líder abatido desmoraliza a la plaza.',
    provoke: 0.0004,
    price: 350,
    upkeep: 25,
    radius: 0.4,
    rowSpacing: 2,
    speed: 0,
    pushRadius: 0,
    dispersal: 0,
    flying: true,
    infantry: false,
    integrity: 80,
    range: 45,
  },
  colectivo: {
    ...BASE,
    type: 'colectivo',
    category: 'especiales',
    infantry: false, // no se repliegan por la moral: van a lo suyo
    name: 'Colectivo paramilitar',
    icon: '🏴',
    description: 'Civiles leales en moto. Atacan por su cuenta a cualquier nivel de fuerza: embisten y apalean. No visten uniforme: la prensa los asocia menos al régimen. Impredecibles: con la plaza encendida, a veces se les va la mano.',
    provoke: 0.001,
    price: 120,
    upkeep: 8,
    radius: 0.6,
    halfLength: 0.5,
    axis: 'z',
    rowSpacing: 1.8,
    speed: 7.5,
    pushRadius: 1.8,
    dispersal: 0.2,
    presence: { radius: 6, strength: 0.07, byStage: [1, 1, 0.6, 0.3] },
    integrity: 55,
  },
  barricade: {
    ...BASE,
    type: 'barricade',
    category: 'vehiculos',
    infantry: false,
    name: 'Barricada',
    icon: '🚧',
    description: 'Fija. Corta el paso y desvía a la multitud. Mejórala en el despacho: concreto y pinchos.',
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
    description: 'Camión hidrante. Apaga el fuego a cualquier nivel; desde Contención agresiva dispersa grupos con el chorro. Intimida en Pacífica y Tensa. Sale del palacio.',
    provoke: 0.0006,
    price: 450,
    upkeep: 25,
    radius: 1.2,
    halfLength: 1.3,
    axis: 'z',
    rowSpacing: 3,
    speed: 3.2,
    pushRadius: 0,
    dispersal: 0,
    presence: { radius: 8, strength: 0.07, byStage: [1, 1, 0, 0] },
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
    description: 'Artillería de gas desde Contención agresiva: salvas al grupo más numeroso. Las nubes sirven de muro. Pulsa F para apuntar a mano. Sale del palacio.',
    provoke: 0.0008,
    price: 600,
    upkeep: 30,
    radius: 1.2,
    halfLength: 1.3,
    axis: 'z',
    rowSpacing: 3,
    speed: 3,
    pushRadius: 0,
    dispersal: 0,
    presence: { radius: 8, strength: 0.07, byStage: [1, 0, 0, 0] },
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
    description: 'Aplasta el fuego al pasar. Zona de miedo: la gente tranquila que entra se da la vuelta. Atrae piedras y bombas para proteger a tu infantería. Provoca mucho y sube la presión internacional. Sale del palacio.',
    provoke: 0.0015,
    price: 800,
    upkeep: 40,
    radius: 1.2,
    halfLength: 1.1,
    axis: 'z',
    rowSpacing: 3,
    speed: 3,
    pushRadius: 2.4,
    dispersal: 0.1,
    presence: { radius: 10, strength: 0.09, byStage: [1, 1, 0.5, 0] },
    integrity: 500,
    fearAura: 10,
    intlPressureOnDeploy: 3,
  },
  supply: {
    ...BASE,
    type: 'supply',
    category: 'vehiculos',
    infantry: false,
    name: 'Camión de suministros',
    icon: '📦',
    description: 'Recarga gas, perdigones y agua a las unidades cercanas, y les sube la moral. Sale del palacio.',
    price: 300,
    upkeep: 12,
    radius: 1.1,
    halfLength: 1.2,
    axis: 'z',
    rowSpacing: 3,
    speed: 3.5,
    pushRadius: 0,
    dispersal: 0,
    hidden: true,
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
    provoke: 0.002,
    integrity: 220,
    fearAura: 12,
    intlPressureOnDeploy: 4,
  },
};

export const BUYABLE_UNITS: readonly UnitType[] = UNIT_ORDER.filter((t) => UNITS[t].price > 0 && !UNITS[t].hidden);
/** Tropas que se ven en la barra de la revuelta. */
export const VISIBLE_UNITS: readonly UnitType[] = UNIT_ORDER.filter((t) => !UNITS[t].hidden);
