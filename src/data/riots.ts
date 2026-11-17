/**
 * Revueltas de Pomposia. Inspiradas libremente en protestas célebres de la historia,
 * pero con nombres, lugares y detalles ficticios.
 */
export type RiotId =
  | 'cacerolazo'
  | 'chalecos'
  | 'primavera'
  | 'flores'
  | 'pan'
  | 'puerto'
  | 'huelga'
  | 'abuelas'
  | 'trancas'
  | 'apagon'
  | 'granmarcha';
export type SpawnId = 'sur' | 'este' | 'oeste';

export interface RiotDef {
  id: RiotId;
  name: string;
  region: string;
  description: string;
  /** Posición en el mapa del país. */
  mapPos: { x: number; z: number };
  protesters: number;
  radicalShare: number;
  leaders: number;
  /** Ira inicial (0..1): más ira = más resistencia y más lanzamientos. */
  aggression: number;
  /** Segundos que hay que aguantar. */
  duration: number;
  spawns: readonly SpawnId[];
  speedMult: number;
  resolveMult: number;
  /** Multiplica la presión internacional por usar la fuerza. */
  intlSensitivity: number;
  /** Si la lealtad militar es baja, las tropas dispersan con desgana. */
  loyaltySensitive: boolean;
  /** Día a partir del cual puede aparecer. */
  minDay: number;
  /** Ocurre de noche (apagón): escena oscura. */
  night?: boolean;
  /** Los manifestantes queman cauchos que bloquean y queman a tus tropas. */
  burnsTires?: boolean;
}

export const RIOTS: Record<RiotId, RiotDef> = {
  cacerolazo: {
    id: 'cacerolazo',
    name: 'El Gran Cacerolazo',
    region: 'Barrio Alto',
    description:
      'Vecinos golpean ollas vacías desde los balcones y bajan a la plaza. Ruidosos, pacíficos... y muchísimos. Reprimirlos queda fatal en la prensa.',
    mapPos: { x: -9, z: -6 },
    protesters: 110,
    radicalShare: 0.03,
    leaders: 3,
    aggression: 0.15,
    duration: 100,
    spawns: ['sur'],
    speedMult: 1,
    resolveMult: 0.9,
    intlSensitivity: 1.3,
    loyaltySensitive: false,
    minDay: 1,
  },
  chalecos: {
    id: 'chalecos',
    name: 'Los Chalecos Naranjas',
    region: 'Autopista Norte',
    description:
      'Camioneros y repartidores, furiosos por el nuevo impuesto a la gasolina. Bloquean rotondas cada sábado y no piensan irse.',
    mapPos: { x: 4, z: -13 },
    protesters: 130,
    radicalShare: 0.18,
    leaders: 4,
    aggression: 0.35,
    duration: 110,
    spawns: ['sur', 'este'],
    speedMult: 1,
    resolveMult: 1,
    intlSensitivity: 1,
    loyaltySensitive: false,
    minDay: 1,
  },
  primavera: {
    id: 'primavera',
    name: 'La Primavera de los Adoquines',
    region: 'Ciudad Universitaria',
    description:
      'Estudiantes arrancan adoquines y pintan consignas poéticas en las paredes. Rápidos, escurridizos y con buena puntería.',
    mapPos: { x: 11, z: -2 },
    protesters: 100,
    radicalShare: 0.35,
    leaders: 5,
    aggression: 0.45,
    duration: 110,
    spawns: ['este', 'oeste'],
    speedMult: 1.3,
    resolveMult: 0.9,
    intlSensitivity: 1.1,
    loyaltySensitive: false,
    minDay: 1,
  },
  flores: {
    id: 'flores',
    name: 'La Revuelta de las Flores',
    region: 'Cuartel del Sur',
    description:
      'Jóvenes oficiales se unen a la multitud repartiendo flores. Si la lealtad militar está por debajo de 50, tus tropas dispersan con desgana.',
    mapPos: { x: -4, z: 12 },
    protesters: 140,
    radicalShare: 0.08,
    leaders: 6,
    aggression: 0.25,
    duration: 120,
    spawns: ['sur', 'oeste'],
    speedMult: 1,
    resolveMult: 1.1,
    intlSensitivity: 1.2,
    loyaltySensitive: true,
    minDay: 3,
  },
  pan: {
    id: 'pan',
    name: 'La Marcha del Pan',
    region: 'Mercado Central',
    description:
      'El precio del pan se triplicó. Una multitud hambrienta marcha directa al palacio con horcas de cartón. Llegan por todos lados.',
    mapPos: { x: -13, z: 5 },
    protesters: 200,
    radicalShare: 0.15,
    leaders: 6,
    aggression: 0.5,
    duration: 130,
    spawns: ['sur', 'este', 'oeste'],
    speedMult: 1,
    resolveMult: 1.1,
    intlSensitivity: 1,
    loyaltySensitive: false,
    minDay: 4,
  },
  puerto: {
    id: 'puerto',
    name: 'La Huelga del Puerto',
    region: 'El Puerto',
    description:
      'Los estibadores paralizan el puerto y marchan con ganchos y bengalas. Duros de pelar y sin ninguna prisa.',
    mapPos: { x: 14, z: 9 },
    protesters: 150,
    radicalShare: 0.4,
    leaders: 4,
    aggression: 0.6,
    duration: 120,
    spawns: ['sur', 'oeste'],
    speedMult: 1.05,
    resolveMult: 1.4,
    intlSensitivity: 1,
    loyaltySensitive: false,
    minDay: 5,
  },
  huelga: {
    id: 'huelga',
    name: 'La Huelga General',
    region: 'Zona Industrial',
    description:
      'Los sindicatos paran el país entero. Una marcha enorme, ordenada y testaruda: no corren, pero tampoco se van.',
    mapPos: { x: 6, z: 10 },
    protesters: 230,
    radicalShare: 0.06,
    leaders: 8,
    aggression: 0.2,
    duration: 140,
    spawns: ['sur', 'este'],
    speedMult: 0.85,
    resolveMult: 1.5,
    intlSensitivity: 1.1,
    loyaltySensitive: false,
    minDay: 2,
  },
  abuelas: {
    id: 'abuelas',
    name: 'El Plantón de las Abuelas',
    region: 'Avenida Central',
    description:
      'Abuelas con sillas plegables y termos de café se sientan frente al palacio. Lentísimas e inofensivas... pero si usas la fuerza, el mundo entero lo verá.',
    mapPos: { x: -1, z: -8 },
    protesters: 70,
    radicalShare: 0,
    leaders: 3,
    aggression: 0.05,
    duration: 100,
    spawns: ['sur'],
    speedMult: 0.6,
    resolveMult: 1.3,
    intlSensitivity: 2.2,
    loyaltySensitive: false,
    minDay: 2,
  },
  trancas: {
    id: 'trancas',
    name: 'Las Trancas del Este',
    region: 'Urbanizaciones del Este',
    description:
      'Los vecinos trancan las calles con escombros y cauchos encendidos. A ratos es una fiesta de barrio; a ratos, una batalla campal.',
    mapPos: { x: 10, z: -9 },
    protesters: 140,
    radicalShare: 0.3,
    leaders: 4,
    aggression: 0.4,
    duration: 120,
    spawns: ['este', 'sur'],
    speedMult: 1.1,
    resolveMult: 1.1,
    intlSensitivity: 1,
    loyaltySensitive: false,
    minDay: 3,
    burnsTires: true,
  },
  apagon: {
    id: 'apagon',
    name: 'La Noche del Apagón',
    region: 'Barrios del Oeste',
    description:
      'Tercer día sin luz. Al caer la noche, los barrios bajan a oscuras hacia el palacio, el único edificio iluminado de la ciudad.',
    mapPos: { x: -14, z: -2 },
    protesters: 170,
    radicalShare: 0.25,
    leaders: 5,
    aggression: 0.55,
    duration: 120,
    spawns: ['oeste', 'sur', 'este'],
    speedMult: 1.1,
    resolveMult: 1.1,
    intlSensitivity: 1,
    loyaltySensitive: false,
    minDay: 6,
    night: true,
    burnsTires: true,
  },
  granmarcha: {
    id: 'granmarcha',
    name: 'La Gran Marcha',
    region: 'Todo el país',
    description:
      'Último día del mandato. Todas las protestas se unen en una sola marcha hacia el palacio, por las tres calles a la vez. Si aguantas hoy, el país es tuyo. Si no...',
    mapPos: { x: 0, z: 0 },
    protesters: 240,
    radicalShare: 0.15,
    leaders: 6,
    aggression: 0.4,
    duration: 150,
    spawns: ['sur', 'este', 'oeste'],
    speedMult: 1,
    resolveMult: 1.15,
    intlSensitivity: 1.3,
    loyaltySensitive: true,
    /** Nunca sale al azar: es la protesta final de la campaña. */
    minDay: 999,
  },
};

/** La protesta final de la campaña. */
export const FINAL_RIOT: RiotId = 'granmarcha';

export const RIOT_LIST: readonly RiotDef[] = Object.values(RIOTS);
