import type { Random } from '../core/Random';
import { DICTATOR } from '../data/country';
import { RIOTS, type RiotDef } from '../data/riots';
import type { RegimeState } from '../sim/regime';
import type { RiotEvent, RiotResult } from '../sim/riot/types';

/** Dos canales: la TV oficial que maquilla todo y un canal internacional que cuenta lo que ve. */
export type NewsSource = 'oficial' | 'internacional';

export interface NewsItem {
  text: string;
  source: NewsSource;
  breaking?: boolean;
}

export const CHANNELS: Record<NewsSource, { name: string; tag: string }> = {
  oficial: { name: 'TV PATRIA', tag: 'Canal oficial' },
  internacional: { name: 'MUNDO 24H', tag: 'Internacional' },
};

const WORLD_FILLER: readonly string[] = [
  'La cumbre del clima termina sin acuerdo y con un catering espectacular.',
  'Un gato es elegido alcalde de un pueblo de los Alpes por tercera vez consecutiva.',
  'El precio mundial del café rompe récords: oficinistas de todo el planeta en alerta.',
  'Expertos en moda confirman que el bigote vuelve a estar de moda.',
  'La vecina República de Tacañia celebra elecciones. De verdad, con votos y todo.',
  'Crisis de chips: faltan tostadoras inteligentes en medio mundo.',
  'Un astronauta jubilado afirma que desde el espacio «se ve todo muy tranquilo».',
  'La liga mundial de fútbol aprueba el uso de drones para revisar los penaltis.',
  'Científicos descubren que las palomas urbanas reconocen caras. Y guardan rencor.',
  'Récord en la Bolsa: las acciones de fabricantes de gas lacrimógeno suben un 40%.',
];

const OFFICIAL_FILLER: readonly string[] = [
  'Récord histórico de cosecha de bananos (dato no verificado, pero sí muy sentido).',
  'El Ministerio de la Felicidad informa que la felicidad nacional sube un 12%.',
  'Hoy a las 20:00: el Generalísimo explica la economía con marionetas.',
  'Ola de calor: el gobierno recuerda que sudar es patriótico.',
  'Inaugurada la autopista más moderna de la región (los primeros 300 metros).',
];

function pick<T>(rng: Random, items: readonly T[]): T {
  return rng.pick(items);
}

/**
 * Cola de titulares. Los "de última hora" se emiten primero; el resto rota en bucle.
 * La lista base se regenera cada día a partir del estado del país.
 */
export class NewsFeed {
  private base: NewsItem[] = [];
  private breaking: NewsItem[] = [];
  private cursor = 0;
  private readonly lastPush = new Map<string, number>();
  private readonly listeners = new Set<() => void>();

  constructor(private readonly rng: Random) {}

  /** Avisa cuando llega una noticia de última hora (para interrumpir el titular actual). */
  onBreaking(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  refresh(state: RegimeState): void {
    this.base = this.rng.shuffle(regimeHeadlines(state, this.rng));
    this.cursor = 0;
  }

  /** Noticia urgente. `key` limita la repetición del mismo tipo (en segundos). */
  pushBreaking(item: NewsItem, key?: string, cooldownSec = 12): void {
    if (key) {
      const now = performance.now() / 1000;
      if (now - (this.lastPush.get(key) ?? -Infinity) < cooldownSec) return;
      this.lastPush.set(key, now);
    }
    this.breaking.push({ ...item, breaking: true });
    if (this.breaking.length > 4) this.breaking.shift();
    for (const fn of this.listeners) fn();
  }

  next(): NewsItem {
    const urgent = this.breaking.shift();
    if (urgent) return urgent;
    if (this.base.length === 0) return { text: pick(this.rng, WORLD_FILLER), source: 'internacional' };
    const item = this.base[this.cursor % this.base.length];
    this.cursor++;
    return item;
  }
}

/** Titulares del día según cómo va el país. */
export function regimeHeadlines(s: RegimeState, rng: Random): NewsItem[] {
  const ruler = `${DICTATOR.title} ${s.rulerName}`;
  const official: string[] = [
    `${ruler} inaugura su estatua número ${s.day * 3 + 12}. «Esta es la más modesta», declara.`,
    `Encuesta oficial: la aprobación del ${DICTATOR.title} alcanza un histórico ${Math.max(97, Math.round(s.popularity) + 40)}%.`,
    pick(rng, OFFICIAL_FILLER),
  ];
  const intl: string[] = [pick(rng, WORLD_FILLER), pick(rng, WORLD_FILLER)];

  if (s.unrest > 45) {
    official.push('«Las protestas son obra de agentes extranjeros y de la astrología», asegura el Ministro de la Verdad.');
    intl.push(`Analistas advierten que el país está «al borde del estallido social». Molestia social: ${Math.round(s.unrest)}%.`);
  } else {
    official.push(`Tranquilidad total en ${s.cityName}: los vecinos salen a pasear y a agradecer al ${DICTATOR.title}.`);
  }
  if (s.intlPressure > 35) intl.push(`La ONU estudia nuevas sanciones contra el régimen de ${s.rulerName}.`);
  if (s.intlPressure > 60) intl.push('Varios países retiran a sus embajadores. Las cuentas del régimen, congeladas.');
  if (s.popularity < 35) intl.push(`Encuestas independientes sitúan la aprobación de ${s.rulerName} en un ${Math.round(s.popularity)}%.`);
  if (s.loyalty < 40) intl.push(`Rumores de malestar en los cuarteles de ${s.cityName}: «los sueldos no llegan», dicen fuentes militares.`);
  if (s.treasury < 300) official.push('El Banco Central anuncia que imprimir billetes «también es un arte».');
  if (s.taxRate > 0.3) intl.push(`Los impuestos alcanzan el ${Math.round(s.taxRate * 100)}%: crecen las colas y el descontento.`);
  if (s.upgrades.includes('propaganda')) official.push('Esta noche, capítulo final de «Amor en el Cuartel». Las calles quedarán vacías.');
  if (s.emergency) {
    official.push('Estado de Excepción: «Es una medida temporal y muy cariñosa», explica el gobierno.');
    intl.push(`Tanques y soldados en las calles de ${s.cityName} tras el decreto de Estado de Excepción.`);
  }
  for (const riot of s.activeRiots) {
    const def = RIOTS[riot.defId];
    intl.push(`Protestas en ${def.region}: «${def.name}» crece y exige cambios.`);
    official.push(`${def.region}: «Pequeña reunión de vecinos sin importancia», según fuentes oficiales.`);
  }

  return [
    ...official.map((text): NewsItem => ({ text, source: 'oficial' })),
    ...intl.map((text): NewsItem => ({ text, source: 'internacional' })),
  ];
}

/** Noticias en vivo durante una revuelta. Devuelve [item, clave para no repetir] o null. */
export function riotHeadline(e: RiotEvent, def: RiotDef, city: string): [NewsItem, string] | null {
  switch (e.type) {
    case 'marchStart':
      return [{ text: `EN VIVO: arranca «${def.name}» rumbo al palacio de ${city}.`, source: 'internacional' }, 'march'];
    case 'escalate':
      if (!e.up) return [{ text: 'Ambiente festivo y pacífico en la Plaza de la Patria. Nada que ver aquí.', source: 'oficial' }, 'calm'];
      if (e.stage === 3) return [{ text: `CAOS en ${city}: barricadas en llamas y bombas incendiarias frente al palacio.`, source: 'internacional' }, 'chaos'];
      if (e.stage === 2) return [{ text: 'ÚLTIMA HORA: graves disturbios en la Plaza de la Patria.', source: 'internacional' }, 'riot'];
      return [{ text: 'Aumenta la tensión: vuelan las primeras piedras en la plaza.', source: 'internacional' }, 'tense'];
    case 'press':
      return [{ text: 'Periodistas denuncian agresiones de la policía mientras cubrían la protesta.', source: 'internacional' }, 'press'];
    case 'arrest':
      return Math.random() < 0.5
        ? [{ text: 'Detenido un peligroso «agitador profesional» con una pancarta.', source: 'oficial' }, 'arrest']
        : [{ text: 'ONG denuncian detenciones arbitrarias de líderes de la protesta.', source: 'internacional' }, 'arrest'];
    case 'deployed':
      if (e.unitType === 'army') return [{ text: `El ejército sale a las calles de ${city}. El mundo observa.`, source: 'internacional' }, 'army'];
      if (e.unitType === 'tanqueta') return [{ text: 'Tanquetas en la plaza: «Están ahí para ordenar el tránsito», aclara el gobierno.', source: 'oficial' }, 'tanqueta'];
      if (e.unitType === 'helicopter') return [{ text: 'Helicópteros sobrevuelan la protesta con reflectores.', source: 'internacional' }, 'heli'];
      return null;
    case 'desert':
      return [{ text: '¡Soldados se niegan a reprimir y se unen a la multitud entre aplausos!', source: 'internacional' }, 'desert'];
    case 'refuse':
      return [{ text: 'Un pelotón del ejército se cruza de brazos frente a los manifestantes.', source: 'internacional' }, 'refuse'];
    case 'gas':
      return [{ text: 'Nubes de gas lacrimógeno cubren el centro de la ciudad.', source: 'internacional' }, 'gas'];
    case 'shot':
      return [{ text: 'Disparos de perdigones contra los manifestantes, según testigos.', source: 'internacional' }, 'shot'];
    case 'tire':
      return [{ text: 'Cauchos en llamas trancan las calles: columnas de humo negro sobre la ciudad.', source: 'internacional' }, 'tire'];
    default:
      return null;
  }
}

/** Titulares tras una revuelta (uno de cada canal). */
export function riotAftermath(result: RiotResult, def: RiotDef, city: string): NewsItem[] {
  if (!result.won) {
    return [
      { text: `Los manifestantes de «${def.name}» toman la escalinata del palacio de ${city}.`, source: 'internacional' },
      { text: '«Fue un ensayo de desfile con público», aclara el gobierno.', source: 'oficial' },
    ];
  }
  const harsh = result.avgForce >= 1.5 || result.armyDeployed > 0 || result.harshness > 8;
  return [
    harsh
      ? { text: `Fuerte represión en ${city} durante «${def.name}». Organismos internacionales piden explicaciones.`, source: 'internacional' }
      : { text: `«${def.name}» termina sin incidentes graves tras horas de tensión.`, source: 'internacional' },
    { text: `Paz y tranquilidad en ${city}: los vecinos regresan felices a casa.`, source: 'oficial' },
  ];
}
