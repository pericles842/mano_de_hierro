import type { UnitType } from './units';

export type UpgradeId =
  | 'policarbonato'
  | 'cascos'
  | 'bate'
  | 'trajes'
  | 'pinchos'
  | 'vallas'
  | 'pimienta'
  | 'flash'
  | 'inhibidor'
  | 'tanques'
  | 'concreto'
  | 'megafonos'
  | 'propaganda'
  | 'mascaras'
  | 'municion';

/** Rama del despacho en la que aparece la mejora. */
export type UpgradeBranch = 'antidisturbios' | 'barricadas' | 'gadgets' | 'unidades' | 'economia';

export interface UpgradeDef {
  id: UpgradeId;
  name: string;
  icon: string;
  description: string;
  price: number;
  branch: UpgradeBranch;
  /** Mejora que hay que tener antes (niveles de una misma rama). */
  requires?: UpgradeId;
}

export const UPGRADE_BRANCHES: Record<UpgradeBranch, string> = {
  antidisturbios: 'Antidisturbios: equipo',
  barricadas: 'Barricadas',
  gadgets: 'Gadgets (1 uso gratis por protesta)',
  unidades: 'Otras unidades',
  economia: 'Economía',
};

export const UPGRADE_ORDER: readonly UpgradeId[] = [
  'cascos',
  'mascaras',
  'trajes',
  'policarbonato',
  'bate',
  'concreto',
  'pinchos',
  'vallas',
  'pimienta',
  'flash',
  'inhibidor',
  'municion',
  'tanques',
  'megafonos',
  'propaganda',
];

export const UPGRADES: Record<UpgradeId, UpgradeDef> = {
  policarbonato: {
    id: 'policarbonato',
    name: 'Escudos de policarbonato',
    icon: '🛡️',
    description: 'Escudos grandes y transparentes: antidisturbios y muros aguantan un 40% más.',
    price: 500,
    branch: 'antidisturbios',
  },
  cascos: {
    id: 'cascos',
    name: 'Cascos con visera',
    icon: '⛑️',
    description: 'Piedras y bombas incendiarias hacen un 40% menos de daño a todas tus tropas. Se ve la visera.',
    price: 300,
    branch: 'antidisturbios',
  },
  bate: {
    id: 'bate',
    name: 'Bates en lugar de porras',
    icon: '🏏',
    description: 'Los antidisturbios cambian la porra por un bate: +50% de dispersión y empuje cuerpo a cuerpo. La gente se enfada más.',
    price: 250,
    branch: 'antidisturbios',
  },
  trajes: {
    id: 'trajes',
    name: 'Trajes antidisturbios',
    icon: '🦺',
    description: 'Protecciones acolchadas e ignífugas: antidisturbios, muros y equipos de captura sufren un 40% menos por palos y fuego.',
    price: 350,
    branch: 'antidisturbios',
  },
  mascaras: {
    id: 'mascaras',
    name: 'Máscaras antigás',
    icon: '😷',
    description: 'Tus tropas dejan de sufrir su propio gas lacrimógeno.',
    price: 250,
    branch: 'antidisturbios',
  },
  municion: {
    id: 'municion',
    name: 'Munición extra',
    icon: '🧰',
    description: 'Granaderos, escopeteros y camiones lanzagás llevan un 50% más de munición.',
    price: 300,
    branch: 'unidades',
  },
  concreto: {
    id: 'concreto',
    name: 'Barricadas de concreto',
    icon: '🧱',
    description: 'Nivel 2: muros de concreto de la misma altura. Resisten el doble.',
    price: 300,
    branch: 'barricadas',
  },
  pinchos: {
    id: 'pinchos',
    name: 'Muros con pinchos',
    icon: '📌',
    description: 'Nivel 3: el concreto lleva pinchos. Quien empuja contra la barricada se desanima y puede salir herido.',
    price: 450,
    branch: 'barricadas',
    requires: 'concreto',
  },
  pimienta: {
    id: 'pimienta',
    name: 'Gas pimienta',
    icon: '🌶️',
    description: 'Gadget (tecla 5): un 40% de tus antidisturbios, muros y perros rocía a quien tiene delante.',
    price: 300,
    branch: 'gadgets',
  },
  flash: {
    id: 'flash',
    name: 'Granadas aturdidoras',
    icon: '💥',
    description: 'Gadget (tecla 6): un 40% de tus antidisturbios y muros lanza flashes: el grupo queda paralizado 3 s.',
    price: 350,
    branch: 'gadgets',
  },
  inhibidor: {
    id: 'inhibidor',
    name: 'Camión inhibidor',
    icon: '📵',
    description: 'Gadget (tecla 7): corta las comunicaciones 30 s. Llega menos gente y la prensa no transmite.',
    price: 500,
    branch: 'gadgets',
  },
  vallas: {
    id: 'vallas',
    name: 'Vallas metálicas desplegables',
    icon: '⛓️',
    description: 'Tus barricadas se pueden mover y quitar también durante la protesta, no solo en la preparación (nunca encima de la gente).',
    price: 350,
    branch: 'barricadas',
  },
  tanques: {
    id: 'tanques',
    name: 'Depósitos de agua extra',
    icon: '💧',
    description: 'Las ballenas cargan un 60% más de agua.',
    price: 400,
    branch: 'unidades',
  },
  megafonos: {
    id: 'megafonos',
    name: 'Megáfonos y negociadores',
    icon: '📢',
    description: 'Con contención o negociadores, la multitud se calma 2,5 veces más rápido.',
    price: 350,
    branch: 'unidades',
  },
  propaganda: {
    id: 'propaganda',
    name: 'Telenovela patriótica',
    icon: '📺',
    description: 'Cada día: molestia social −2 y popularidad +1. El pueblo llora con «Amor en el Cuartel».',
    price: 600,
    branch: 'economia',
  },
};

export interface UpgradeEffects {
  integrityMult: Record<UnitType, number>;
  waterMult: number;
  calmMult: number;
  projectileDamageMult: number;
  ammoMult: number;
  gasImmune: boolean;
  /** Multiplicador cuerpo a cuerpo de los antidisturbios (bate). */
  meleeMult: number;
  /** Daño que reciben por palos y fuego, por tipo (trajes antidisturbios). */
  bruiseMult: Record<UnitType, number>;
  /** Las barricadas llevan pinchos. */
  spikes: boolean;
  /** Vallas desplegables: las barricadas se recolocan también durante la protesta. */
  fences: boolean;
}

export function upgradeEffects(owned: readonly UpgradeId[]): UpgradeEffects {
  const has = (id: UpgradeId): boolean => owned.includes(id);
  const armor = has('policarbonato') ? 1.4 : 1;
  const padded = has('trajes') ? 0.6 : 1;
  return {
    integrityMult: {
      soldier: armor,
      shield: armor,
      gasser: 1,
      shotgun: 1,
      moto: 1,
      capture: 1,
      negotiator: 1,
      k9: 1,
      sniper: 1,
      colectivo: 1,
      barricade: has('concreto') ? 2 : 1,
      ballena: 1,
      gastruck: 1,
      tanqueta: 1,
      supply: 1,
      army: 1,
    },
    waterMult: has('tanques') ? 1.6 : 1,
    calmMult: has('megafonos') ? 2.5 : 1,
    projectileDamageMult: has('cascos') ? 0.6 : 1,
    ammoMult: has('municion') ? 1.5 : 1,
    gasImmune: has('mascaras'),
    meleeMult: has('bate') ? 1.5 : 1,
    bruiseMult: {
      soldier: padded,
      shield: padded,
      gasser: 1,
      shotgun: 1,
      moto: 1,
      capture: padded,
      negotiator: 1,
      k9: 1,
      sniper: 1,
      colectivo: 1,
      barricade: 1,
      ballena: 1,
      gastruck: 1,
      tanqueta: 1,
      supply: 1,
      army: 1,
    },
    spikes: has('pinchos'),
    fences: has('vallas'),
  };
}
