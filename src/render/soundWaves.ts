import type { VoxelParticles } from './particles';

/** Tipo de efecto: el megáfono del negociador o el forcejeo de la infantería. */
export type WaveKind = 'megaphone' | 'push' | 'leader' | 'flash' | 'medic';

interface WaveStyle {
  /** Segundos entre soplos de una misma tropa. */
  interval: number;
  /** Cubitos por soplo. */
  count: number;
  /** Velocidad hacia delante. */
  speed: number;
  /** Apertura del abanico (radianes). */
  spread: number;
  size: number;
  life: number;
  color: number;
}

/**
 * Discretos, al estilo de las lágrimas de los que huyen: unos pocos cubitos rojos
 * que salen hacia delante y se apagan enseguida.
 */
const STYLES: Record<WaveKind, WaveStyle> = {
  megaphone: { interval: 0.45, count: 2, speed: 2.4, spread: 0.6, size: 0.1, life: 0.55, color: 0xef4444 },
  push: { interval: 0.55, count: 1, speed: 1.6, spread: 1.2, size: 0.13, life: 0.45, color: 0xdc2626 },
  /** Líder arengando: cubitos dorados al hablar. */
  leader: { interval: 0.6, count: 1, speed: 1.8, spread: 0.8, size: 0.1, life: 0.5, color: 0xfacc15 },
  /** Prensa: flash de cámara. */
  flash: { interval: 2.6, count: 2, speed: 0.4, spread: Math.PI * 2, size: 0.15, life: 0.18, color: 0xffffff },
  /** Médico: chispa verde sobre la cabeza. */
  medic: { interval: 1.3, count: 1, speed: 0.15, spread: Math.PI * 2, size: 0.11, life: 0.7, color: 0x22c55e },
};

/** Desde dónde salen, en coordenadas locales de la tropa (+z = hacia delante). */
const ORIGINS: Record<WaveKind, { x: number; y: number; z: number }> = {
  megaphone: { x: 0.45, y: 1.7, z: 0.5 }, // boca del megáfono, en la mano en alto
  push: { x: 0, y: 1.1, z: 0.45 }, // a la altura de la cabeza, justo delante
  leader: { x: 0.3, y: 1.5, z: 0.3 },
  flash: { x: 0.2, y: 1.55, z: 0.35 },
  medic: { x: 0, y: 1.75, z: 0 },
};

/** Efecto visual de "están haciendo algo": negociador hablando y agentes repeliendo. */
export class SoundWaves {
  /** Tiempo hasta el próximo soplo de cada tropa. */
  private readonly timers = new Map<number, number>();

  constructor(private readonly particles: VoxelParticles) {}

  /** Llamar cada fotograma por cada tropa que esté hablando o empujando. */
  emit(unitId: number, kind: WaveKind, x: number, z: number, heading: number, simDt: number): void {
    const style = STYLES[kind];
    let t = this.timers.get(unitId) ?? Math.random() * style.interval; // desfasados para que no latan a la vez
    t -= simDt;
    if (t <= 0) {
      t += style.interval;
      this.spawn(kind, x, z, heading);
    }
    this.timers.set(unitId, t);
  }

  /**
   * La tropa no emite en este fotograma. El temporizador se conserva: el forcejeo
   * se enciende y apaga paso a paso, y reiniciarlo impediría que saliera nada.
   */
  idle(unitId: number, alive = true): void {
    if (!alive) this.timers.delete(unitId);
  }

  private spawn(kind: WaveKind, x: number, z: number, heading: number): void {
    const style = STYLES[kind];
    const o = ORIGINS[kind];
    const sin = Math.sin(heading);
    const cos = Math.cos(heading);
    // Misma rotación en Y que la malla de la tropa.
    const ox = x + o.x * cos + o.z * sin;
    const oz = z - o.x * sin + o.z * cos;
    for (let i = 0; i < style.count; i++) {
      const a = heading + (Math.random() - 0.5) * style.spread;
      const s = style.speed * (0.8 + Math.random() * 0.4);
      this.particles.spawn({
        x: ox,
        y: o.y,
        z: oz,
        vx: Math.sin(a) * s,
        vy: 0.3 + Math.random() * 0.4,
        vz: Math.cos(a) * s,
        life: style.life * (0.8 + Math.random() * 0.4),
        size: style.size,
        sizeEnd: style.size * 0.2,
        color: style.color,
        drag: 2,
      });
    }
  }
}
