/**
 * Objetivos secundarios: cada protesta trae uno al azar. Si ganas y lo cumples, hay recompensa.
 */
export type ObjectiveId = 'lideres' | 'sinMuertos' | 'prensa' | 'sinVehiculos' | 'dispersar';

/** Lo que hace falta saber de la protesta para comprobar un objetivo. */
export interface ObjectiveStats {
  leadersDown: number;
  deaths: number;
  pressIncidents: number;
  vehiclesUsed: number;
  dispersed: number;
  total: number;
}

export interface ObjectiveDef {
  id: ObjectiveId;
  icon: string;
  name: string;
  reward: { treasury?: number; loyalty?: number; popularity?: number };
  rewardText: string;
  /** Progreso legible en el HUD y si está cumplido. */
  status(s: ObjectiveStats): { text: string; done: boolean };
}

export const OBJECTIVES: Record<ObjectiveId, ObjectiveDef> = {
  lideres: {
    id: 'lideres',
    icon: '📣',
    name: 'Descabeza la protesta: neutraliza a 2 líderes',
    reward: { treasury: 200, loyalty: 3 },
    rewardText: '+₱200 · +3 lealtad',
    status: (s) => ({ text: `${Math.min(2, s.leadersDown)}/2 líderes`, done: s.leadersDown >= 2 }),
  },
  sinMuertos: {
    id: 'sinMuertos',
    icon: '🕊️',
    name: 'Ni un muerto',
    reward: { popularity: 4, treasury: 100 },
    rewardText: '+4 popularidad · +₱100',
    status: (s) => ({ text: s.deaths === 0 ? 'sin muertos' : `${s.deaths} muertos`, done: s.deaths === 0 }),
  },
  prensa: {
    id: 'prensa',
    icon: '📸',
    name: 'Que la prensa no grabe más de 2 agresiones',
    reward: { treasury: 150, popularity: 2 },
    rewardText: '+₱150 · +2 popularidad',
    status: (s) => ({ text: `${s.pressIncidents}/2 agresiones grabadas`, done: s.pressIncidents <= 2 }),
  },
  sinVehiculos: {
    id: 'sinVehiculos',
    icon: '🚫',
    name: 'Aguanta sin sacar vehículos del palacio',
    reward: { treasury: 250 },
    rewardText: '+₱250',
    status: (s) => ({ text: s.vehiclesUsed === 0 ? 'ningún vehículo' : `${s.vehiclesUsed} vehículos`, done: s.vehiclesUsed === 0 }),
  },
  dispersar: {
    id: 'dispersar',
    icon: '🧹',
    name: 'Dispersa al menos a la mitad de la multitud',
    reward: { treasury: 150, loyalty: 2 },
    rewardText: '+₱150 · +2 lealtad',
    status: (s) => {
      const goal = Math.ceil(s.total * 0.5);
      return { text: `${Math.min(goal, s.dispersed)}/${goal} dispersados`, done: s.dispersed >= goal };
    },
  },
};

export const OBJECTIVE_LIST: readonly ObjectiveId[] = ['lideres', 'sinMuertos', 'prensa', 'sinVehiculos', 'dispersar'];
