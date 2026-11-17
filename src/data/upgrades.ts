import type { UnitType } from './units';

export type UpgradeId =
  | 'policarbonato'
  | 'cascos'
  | 'tanques'
  | 'concreto'
  | 'megafonos'
  | 'propaganda'
  | 'mascaras'
  | 'municion';

export interface UpgradeDef {
  id: UpgradeId;
  name: string;
  icon: string;
  description: string;
  price: number;
}

export const UPGRADE_ORDER: readonly UpgradeId[] = [
  'policarbonato',
  'cascos',
  'mascaras',
  'municion',
  'concreto',
  'tanques',
  'megafonos',
  'propaganda',
];

export const UPGRADES: Record<UpgradeId, UpgradeDef> = {
  policarbonato: {
    id: 'policarbonato',
    name: 'Escudos de policarbonato',
    icon: '🛡️',
    description: 'Antidisturbios y muros de escudos aguantan un 40% más.',
    price: 500,
  },
  cascos: {
    id: 'cascos',
    name: 'Cascos con visera',
    icon: '⛑️',
    description: 'Piedras y bombas incendiarias hacen un 40% menos de daño.',
    price: 300,
  },
  mascaras: {
    id: 'mascaras',
    name: 'Máscaras antigás',
    icon: '😷',
    description: 'Tus tropas dejan de sufrir su propio gas lacrimógeno.',
    price: 250,
  },
  municion: {
    id: 'municion',
    name: 'Munición extra',
    icon: '🧰',
    description: 'Granaderos, escopeteros y camiones lanzagás llevan un 50% más de munición.',
    price: 300,
  },
  concreto: {
    id: 'concreto',
    name: 'Barricadas de concreto',
    icon: '🧱',
    description: 'Las barricadas resisten el doble.',
    price: 300,
  },
  tanques: {
    id: 'tanques',
    name: 'Depósitos de agua extra',
    icon: '💧',
    description: 'Las ballenas cargan un 60% más de agua.',
    price: 400,
  },
  megafonos: {
    id: 'megafonos',
    name: 'Megáfonos y negociadores',
    icon: '📢',
    description: 'Con contención o negociadores, la multitud se calma 2,5 veces más rápido.',
    price: 350,
  },
  propaganda: {
    id: 'propaganda',
    name: 'Telenovela patriótica',
    icon: '📺',
    description: 'Cada día: molestia social −2 y popularidad +1. El pueblo llora con «Amor en el Cuartel».',
    price: 600,
  },
};

export interface UpgradeEffects {
  integrityMult: Record<UnitType, number>;
  waterMult: number;
  calmMult: number;
  projectileDamageMult: number;
  ammoMult: number;
  gasImmune: boolean;
}

export function upgradeEffects(owned: readonly UpgradeId[]): UpgradeEffects {
  const has = (id: UpgradeId): boolean => owned.includes(id);
  const armor = has('policarbonato') ? 1.4 : 1;
  return {
    integrityMult: {
      soldier: armor,
      shield: armor,
      gasser: 1,
      shotgun: 1,
      moto: 1,
      capture: 1,
      negotiator: 1,
      barricade: has('concreto') ? 2 : 1,
      ballena: 1,
      gastruck: 1,
      tanqueta: 1,
      bulldozer: 1,
      helicopter: 1,
      supply: 1,
      army: 1,
    },
    waterMult: has('tanques') ? 1.6 : 1,
    calmMult: has('megafonos') ? 2.5 : 1,
    projectileDamageMult: has('cascos') ? 0.6 : 1,
    ammoMult: has('municion') ? 1.5 : 1,
    gasImmune: has('mascaras'),
  };
}
