/**
 * Gadgets: acciones de un solo uso por protesta que activa el jugador.
 * Se desbloquean como mejora en el despacho; cada protesta trae 1 uso gratis
 * y se pueden comprar cargas extra.
 */
export type GadgetId = 'pimienta' | 'flash' | 'inhibidor';

export interface GadgetDef {
  id: GadgetId;
  name: string;
  icon: string;
  /** Tecla para activarlo durante la protesta. */
  key: string;
  description: string;
  /** Precio de una carga extra en el despacho. */
  chargePrice: number;
}

export const GADGET_ORDER: readonly GadgetId[] = ['pimienta', 'flash', 'inhibidor'];

/** Parte de los agentes que usa el gadget (no todos: solo un porcentaje). */
export const GADGET_SHARE = 0.4;

export const GADGETS: Record<GadgetId, GadgetDef> = {
  pimienta: {
    id: 'pimienta',
    name: 'Gas pimienta',
    icon: '🌶️',
    key: '5',
    description: 'Un 40% de tus antidisturbios, muros y perros rocía a quien tiene delante: pierden casi todo el ánimo y huyen tosiendo.',
    chargePrice: 120,
  },
  flash: {
    id: 'flash',
    name: 'Granadas aturdidoras',
    icon: '💥',
    key: '6',
    description: 'Un 40% de tus antidisturbios y muros lanza un flash al grupo más cercano: quedan paralizados 3 s, sin moverse ni atacar.',
    chargePrice: 150,
  },
  inhibidor: {
    id: 'inhibidor',
    name: 'Camión inhibidor',
    icon: '📵',
    key: '7',
    description: 'Corta internet y teléfonos 30 s: llega un 30% menos de gente de las oleadas pendientes y la prensa no puede transmitir. Enfada.',
    chargePrice: 250,
  },
};
