/**
 * Fases de conducta de la multitud según su ira (0..1).
 * Una protesta puede empezar pacífica y volverse un caos... o calmarse si no la provocas.
 */
export type CrowdStage = 0 | 1 | 2 | 3;

export interface CrowdStageDef {
  stage: CrowdStage;
  name: string;
  icon: string;
  color: string;
  description: string;
  /** Ira mínima para entrar en esta fase. */
  threshold: number;
  speedMult: number;
  palaceMult: number;
  /** Ciclo marchar/detenerse a cantar (segundos). 0 = no se detienen. */
  march: number;
  pause: number;
}

export const CROWD_STAGES: readonly CrowdStageDef[] = [
  {
    stage: 0,
    name: 'Pacífica',
    icon: '🕊️',
    color: '#60a5fa',
    description: 'Marchan cantando consignas y se detienen a ratos.',
    threshold: 0,
    speedMult: 0.65,
    palaceMult: 0.5,
    march: 10,
    pause: 5,
  },
  {
    stage: 1,
    name: 'Tensa',
    icon: '😠',
    color: '#facc15',
    description: 'Empiezan a volar piedras.',
    threshold: 0.3,
    speedMult: 0.85,
    palaceMult: 0.8,
    march: 14,
    pause: 3,
  },
  {
    stage: 2,
    name: 'Disturbios',
    icon: '🔥',
    color: '#fb923c',
    description: 'Palos, piedras y empujones. Ya no se detienen.',
    threshold: 0.5,
    speedMult: 1,
    palaceMult: 1,
    march: 0,
    pause: 0,
  },
  {
    stage: 3,
    name: 'Caos',
    icon: '🌪️',
    color: '#ef4444',
    description: 'Bombas incendiarias y furia total.',
    threshold: 0.72,
    speedMult: 1.25,
    palaceMult: 1.5,
    march: 0,
    pause: 0,
  },
];

/** Margen para bajar de fase (evita que parpadee entre dos fases). */
export const STAGE_HYSTERESIS = 0.06;

export function stageForAnger(anger: number): CrowdStage {
  let s: CrowdStage = 0;
  for (const def of CROWD_STAGES) if (anger >= def.threshold) s = def.stage;
  return s;
}
