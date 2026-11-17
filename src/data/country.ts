export const GAME_TITLE = 'MANO DE HIERRO';
export const GAME_TAGLINE = 'Un simulador de dictador con mucho bigote';

export const COUNTRY = {
  name: 'República Popular de Pomposia',
  shortName: 'Pomposia',
  capital: 'Ciudad Pompón',
  currencySymbol: '₱',
  motto: '¡Orden, Bigote y Progreso!',
} as const;

export const DICTATOR = {
  title: 'Generalísimo',
  name: 'Bartolomé Pomposo III',
  nickname: 'El Gran Bigote',
  honorifics: [
    'Padre de la Patria',
    'Primer Atleta de la Nación',
    'Campeón Vitalicio de Ajedrez (nadie se atreve a ganarle)',
    'Inventor Oficial de la Siesta',
  ],
} as const;

export const CAMPAIGN_DAYS = 15;

export const DEFAULT_NAMES = {
  rulerName: DICTATOR.name,
  cityName: COUNTRY.capital,
} as const;

export const NAME_MAX_LENGTH = 28;
