import type { ProtesterKind, Weapon } from '../sim/riot/types';

/** Ficha de cada clase de manifestante (se ve al pasar el ratón por encima). */
export const PROTESTER_KINDS: Record<ProtesterKind, { name: string; icon: string; description: string }> = {
  pacifico: {
    name: 'Manifestante',
    icon: '🙋',
    description: 'Marcha y protesta. Si la protesta escala, puede coger palos o piedras.',
  },
  radical: {
    name: 'Radical',
    icon: '😠',
    description: 'Vanguardia: no se queda en la plaza, empuja hacia el palacio y no teme a la tanqueta. Se arma antes que nadie.',
  },
  lider: {
    name: 'Líder',
    icon: '📣',
    description: 'Arenga a los de alrededor y les devuelve el ánimo. Arrestarlo los desanima; matarlo lo convierte en mártir.',
  },
  escudero: {
    name: 'Escudero',
    icon: '🛡️',
    description: 'Escudo casero: el empuje, el agua y los perdigones le hacen la mitad y el gas apenas lo frena.',
  },
  prensa: {
    name: 'Prensa',
    icon: '📸',
    description: 'No protesta: graba. Usar la fuerza cerca de un periodista sube la presión internacional.',
  },
  medico: {
    name: 'Médico',
    icon: '🩺',
    description: 'Levanta a los heridos y hace volver a los que huyen, salvo si los persiguen las motos.',
  },
};

export const WEAPON_NAMES: Record<Weapon, string> = {
  none: '',
  piedra: '🪨 Piedras',
  palo: '🪵 Palo',
  molotov: '🔥 Bomba incendiaria',
  arma: '🔫 Arma de fuego',
};
