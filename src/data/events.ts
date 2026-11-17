import type { UnitType } from './units';

/** Efectos de una decisión. Los números se suman a los indicadores del régimen. */
export interface EventEffects {
  treasury?: number;
  popularity?: number;
  intlPressure?: number;
  loyalty?: number;
  unrest?: number;
  stock?: Partial<Record<UnitType, number>>;
}

export interface EventOption {
  label: string;
  outcome: string;
  effects: EventEffects;
}

/** Datos mínimos del régimen que necesita un evento para decidir si puede aparecer. */
export interface EventContext {
  day: number;
  treasury: number;
  popularity: number;
  intlPressure: number;
  loyalty: number;
  unrest: number;
  stock: Record<UnitType, number>;
}

export interface GameEventDef {
  id: string;
  icon: string;
  title: string;
  /** Admite {ruler} y {city}. */
  text: string;
  options: readonly EventOption[];
  condition?: (s: EventContext) => boolean;
}

export const EVENTS: readonly GameEventDef[] = [
  {
    id: 'golpe',
    icon: '🕵️',
    title: 'Rumores de conspiración',
    text: 'Tu jefe de inteligencia susurra que el coronel Cuchufleta se reúne de noche con otros oficiales. «Dicen que juegan dominó, Generalísimo... pero nadie juega dominó tan serio».',
    condition: (s) => s.loyalty < 60,
    options: [
      {
        label: 'Purgar a los conspiradores',
        outcome: 'Cuchufleta es «trasladado» a una base en el Polo. Los demás oficiales captan el mensaje... y la prensa extranjera también.',
        effects: { loyalty: 6, intlPressure: 6, unrest: 3 },
      },
      {
        label: 'Comprar su lealtad (₱300)',
        outcome: 'Cuchufleta recibe un ascenso, una medalla y un televisor de 85 pulgadas. Ahora te adora.',
        effects: { treasury: -300, loyalty: 10 },
      },
      {
        label: 'Ignorarlo',
        outcome: 'Es solo dominó... ¿verdad?',
        effects: { loyalty: -7 },
      },
    ],
  },
  {
    id: 'periodista',
    icon: '🎙️',
    title: 'Una periodista extranjera pide entrevista',
    text: 'Una corresponsal de un gran canal internacional quiere entrevistar a {ruler} en el palacio de {city}.',
    options: [
      {
        label: 'Conceder la entrevista',
        outcome: 'Hablas 3 horas sin parar de tu infancia y de tu bigote. La entrevista se vuelve viral... por motivos variados.',
        effects: { intlPressure: -6, popularity: -2 },
      },
      {
        label: 'Expulsarla del país',
        outcome: 'Sale escoltada al aeropuerto. Su reportaje se titula «El país donde no se puede preguntar».',
        effects: { intlPressure: 8, unrest: 2 },
      },
    ],
  },
  {
    id: 'prestamo',
    icon: '💰',
    title: 'Un préstamo de un país «amigo»',
    text: 'Un gobierno lejano ofrece un préstamo generoso. A cambio pide «pequeñas concesiones»: las minas, el puerto y el derecho a nombrar a la mascota nacional.',
    options: [
      {
        label: 'Aceptar (+₱900)',
        outcome: 'El dinero llega. La mascota nacional ahora es un panda. Mucha gente no lo perdona.',
        effects: { treasury: 900, unrest: 6, popularity: -3 },
      },
      {
        label: 'Rechazar con dignidad',
        outcome: 'Das un discurso de 4 horas sobre la soberanía. Aplauden hasta los que no te quieren.',
        effects: { popularity: 3 },
      },
    ],
  },
  {
    id: 'desfile',
    icon: '🎖️',
    title: 'Tu cumpleaños se acerca',
    text: 'El Ministerio de Lealtad propone un desfile militar con tanques, aviones y un pastel con forma de {ruler}.',
    options: [
      {
        label: 'Desfile por todo lo alto (₱250)',
        outcome: 'Los soldados desfilan orgullosos. El pastel pesaba 400 kilos.',
        effects: { treasury: -250, loyalty: 7, popularity: 1 },
      },
      {
        label: 'Celebración modesta',
        outcome: 'Pides empanadas para todos. Los generales esperaban más.',
        effects: { loyalty: -3, popularity: 2 },
      },
    ],
  },
  {
    id: 'escasez',
    icon: '🍞',
    title: 'Escasez en los mercados',
    text: 'Las colas para comprar harina en {city} dan la vuelta a la manzana. La gente empieza a murmurar.',
    options: [
      {
        label: 'Subsidiar la comida (₱350)',
        outcome: 'Los estantes se llenan. Por unos días, nadie piensa en protestar.',
        effects: { treasury: -350, unrest: -9, popularity: 4 },
      },
      {
        label: 'Culpar al imperio en televisión',
        outcome: 'Tu discurso es épico. Las colas siguen ahí.',
        effects: { unrest: 5, popularity: 1 },
      },
    ],
  },
  {
    id: 'desercion',
    icon: '🏃',
    title: 'Deserciones en el cuartel',
    text: 'Tres antidisturbios se quitaron el uniforme y se unieron a los manifestantes. Los vídeos circulan por todo el país.',
    condition: (s) => s.stock.soldier >= 3,
    options: [
      {
        label: 'Perseguirlos (₱100)',
        outcome: 'Los encuentras cantando consignas en una plaza. Vuelven al cuartel, cabizbajos.',
        effects: { treasury: -100, loyalty: 3, unrest: 3 },
      },
      {
        label: 'Dejarlos ir',
        outcome: 'Pierdes tres agentes. La multitud los recibe como héroes.',
        effects: { stock: { soldier: -3 }, loyalty: -3, unrest: -2 },
      },
    ],
  },
  {
    id: 'concierto',
    icon: '🎸',
    title: 'Un concierto por la paz',
    text: 'Los músicos más famosos del país quieren dar un concierto gratuito en el estadio de {city}.',
    options: [
      {
        label: 'Permitirlo',
        outcome: 'Cien mil personas cantan juntas. Algunas letras no te dejan muy bien, pero el ambiente se relaja.',
        effects: { unrest: -7, popularity: -1, intlPressure: -3 },
      },
      {
        label: 'Prohibirlo',
        outcome: 'El concierto se hace igual, en las azoteas. Ahora es leyenda.',
        effects: { unrest: 6, intlPressure: 4 },
      },
    ],
  },
  {
    id: 'sanciones',
    icon: '🌍',
    title: 'Amenaza de sanciones',
    text: 'Una cumbre internacional estudia congelar las cuentas de {ruler} en el extranjero por la represión.',
    condition: (s) => s.intlPressure > 40,
    options: [
      {
        label: 'Liberar presos políticos',
        outcome: 'Un gesto de buena voluntad. Los diplomáticos sonríen; tus generales, no tanto.',
        effects: { intlPressure: -12, loyalty: -4, unrest: -3 },
      },
      {
        label: 'Contratar una agencia de imagen (₱400)',
        outcome: 'Tu nuevo eslogan, «Pomposia: el bigote del Caribe», funciona sorprendentemente bien.',
        effects: { treasury: -400, intlPressure: -8 },
      },
      {
        label: 'Desafiar a la cumbre',
        outcome: 'Llamas «bigotefóbicos» a los líderes mundiales. Las sanciones llegan.',
        effects: { intlPressure: 8, popularity: 2 },
      },
    ],
  },
  {
    id: 'armas',
    icon: '📦',
    title: 'Un traficante de armas toca a la puerta',
    text: 'Un señor con gafas oscuras ofrece «material antidisturbios de segunda mano, casi sin uso».',
    condition: (s) => s.day >= 3,
    options: [
      {
        label: 'Comprar el lote (₱500)',
        outcome: 'Llegan dos muros de escudos y una ballena algo oxidada.',
        effects: { treasury: -500, stock: { shield: 2, ballena: 1 }, intlPressure: 2 },
      },
      {
        label: 'Echarlo del palacio',
        outcome: 'Se va murmurando que volverá. Siempre vuelven.',
        effects: {},
      },
    ],
  },
];
