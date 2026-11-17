import type { RiotEvent } from '../sim/riot/types';

export type Sfx =
  | 'click'
  | 'place'
  | 'cancel'
  | 'spray'
  | 'gas'
  | 'pellet'
  | 'rock'
  | 'molotov'
  | 'break'
  | 'escalate'
  | 'calm'
  | 'siren'
  | 'wave'
  | 'win'
  | 'lose';

/** Mínimo de milisegundos entre dos reproducciones del mismo sonido (evita saturar). */
const RATE_LIMIT_MS: Partial<Record<Sfx, number>> = {
  spray: 140,
  rock: 70,
  pellet: 160,
  gas: 220,
  molotov: 120,
  place: 40,
  click: 30,
};

const CHANT_PATTERN = [1, 0, 1, 0, 1, 1, 0, 0];
const MUTE_KEY = 'manodehierro.muted';

export interface CrowdMood {
  active: number;
  anger: number;
  stage: number;
  chanting: boolean;
  /** Cacerolazo: golpes de ollas en lugar de palmas. */
  pots: boolean;
}

/**
 * Sonido 100% sintetizado con Web Audio (sin archivos): multitud, consignas,
 * cacerolas, agua, gas, perdigones, sirenas...
 */
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private crowdGain: GainNode | null = null;
  private crowdFilter: BiquadFilterNode | null = null;
  private crowdSource: AudioBufferSourceNode | null = null;
  private readonly lastPlayed = new Map<Sfx, number>();
  private chantClock = 0;
  private chantStep = 0;
  private shoutClock = 0;
  private _muted = readMuted();

  get muted(): boolean {
    return this._muted;
  }

  /** Los navegadores solo permiten audio tras un gesto del usuario. */
  unlock(): void {
    if (!this.ctx) {
      const ctx = new AudioContext();
      this.ctx = ctx;
      this.master = ctx.createGain();
      this.master.gain.value = this._muted ? 0 : 0.55;
      this.master.connect(ctx.destination);
      const length = ctx.sampleRate * 2;
      this.noise = ctx.createBuffer(1, length, ctx.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  toggleMute(): boolean {
    this._muted = !this._muted;
    try {
      localStorage.setItem(MUTE_KEY, this._muted ? '1' : '0');
    } catch {
      // almacenamiento no disponible: no pasa nada
    }
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(this._muted ? 0 : 0.55, this.ctx.currentTime, 0.05);
    return this._muted;
  }

  play(name: Sfx): void {
    if (!this.ctx || this._muted) return;
    const now = performance.now();
    const limit = RATE_LIMIT_MS[name] ?? 0;
    if (now - (this.lastPlayed.get(name) ?? -Infinity) < limit) return;
    this.lastPlayed.set(name, now);

    switch (name) {
      case 'click':
        this.tone('square', 900, 600, 0.04, 0.05);
        break;
      case 'place':
        this.tone('square', 320, 140, 0.08, 0.09);
        this.burst(0.06, 0.12, 'lowpass', 900);
        break;
      case 'cancel':
        this.tone('triangle', 500, 250, 0.1, 0.08);
        break;
      case 'spray':
        this.burst(0.28, 0.07, 'highpass', 2600);
        break;
      case 'gas':
        this.tone('sine', 150, 45, 0.25, 0.3);
        this.burst(0.6, 0.08, 'bandpass', 1300, 0.8, 0.05);
        break;
      case 'pellet':
        for (const delay of [0, 0.07, 0.15]) this.burst(0.04, 0.22, 'bandpass', 1800, 2, delay);
        break;
      case 'rock':
        this.tone('triangle', 1000, 350, 0.06, 0.1);
        break;
      case 'molotov':
        this.burst(0.12, 0.18, 'highpass', 4000);
        this.burst(1, 0.22, 'lowpass', 600, 1, 0.06);
        break;
      case 'break':
        this.burst(0.6, 0.3, 'lowpass', 900);
        this.tone('sawtooth', 120, 40, 0.4, 0.1);
        break;
      case 'escalate':
        this.tone('sawtooth', 220, 220, 0.25, 0.08);
        this.tone('sawtooth', 185, 185, 0.4, 0.08, 0.25);
        break;
      case 'calm':
        this.tone('sine', 520, 660, 0.3, 0.08);
        break;
      case 'siren':
        this.tone('sine', 600, 950, 0.4, 0.06);
        this.tone('sine', 950, 600, 0.4, 0.06, 0.4);
        break;
      case 'wave':
        this.tone('sine', 1800, 2300, 0.12, 0.06);
        this.tone('sine', 1800, 2300, 0.12, 0.06, 0.18);
        break;
      case 'win':
        [523, 659, 784, 1046].forEach((f, i) => this.tone('triangle', f, f, 0.22, 0.12, i * 0.14));
        break;
      case 'lose':
        [392, 330, 262, 196].forEach((f, i) => this.tone('triangle', f, f * 0.98, 0.3, 0.12, i * 0.2));
        break;
    }
  }

  handleRiotEvents(events: readonly RiotEvent[]): void {
    for (const e of events) {
      switch (e.type) {
        case 'throw':
          this.play('rock');
          break;
        case 'molotov':
        case 'tire':
          this.play('molotov');
          break;
        case 'spray':
          this.play('spray');
          break;
        case 'impact':
          this.play(e.level >= 2 ? 'pellet' : 'gas');
          break;
        case 'unitBroken':
          this.play('break');
          break;
        case 'escalate':
          this.play(e.up ? 'escalate' : 'calm');
          break;
        case 'wave':
        case 'marchStart':
          this.play('wave');
          break;
        case 'disperse':
          break;
      }
    }
  }

  startCrowd(): void {
    if (!this.ctx || !this.master || !this.noise || this.crowdSource) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    this.crowdFilter = this.ctx.createBiquadFilter();
    this.crowdFilter.type = 'bandpass';
    this.crowdFilter.Q.value = 0.7;
    this.crowdGain = this.ctx.createGain();
    this.crowdGain.gain.value = 0;
    src.connect(this.crowdFilter).connect(this.crowdGain).connect(this.master);
    src.start();
    this.crowdSource = src;
  }

  /** Murmullo de la multitud, consignas rítmicas cuando está tranquila y gritos cuando estalla. */
  updateCrowd(dt: number, mood: CrowdMood): void {
    if (!this.ctx || !this.crowdGain || !this.crowdFilter) return;
    const t = this.ctx.currentTime;
    const size = Math.min(1, mood.active / 150);
    this.crowdGain.gain.setTargetAtTime(size * (0.06 + mood.anger * 0.16), t, 0.3);
    this.crowdFilter.frequency.setTargetAtTime(350 + mood.anger * 650, t, 0.3);
    if (this._muted || dt <= 0 || mood.active === 0) return;

    if (mood.stage <= 1 || mood.chanting) {
      this.chantClock -= dt;
      if (this.chantClock <= 0) {
        this.chantClock += 0.3;
        this.chantStep = (this.chantStep + 1) % CHANT_PATTERN.length;
        if (CHANT_PATTERN[this.chantStep]) {
          const vol = 0.04 + size * 0.08;
          if (mood.pots) {
            for (const f of [830, 1240, 1790]) this.tone('square', f, f * 0.97, 0.12, vol * 0.35);
          } else {
            this.burst(0.18, vol, 'bandpass', 650, 3);
            this.tone('sawtooth', 210, 180, 0.18, vol * 0.25);
          }
        }
      }
    }
    if (mood.stage >= 2) {
      this.shoutClock -= dt;
      if (this.shoutClock <= 0) {
        this.shoutClock = 0.4 + Math.random() * (mood.stage >= 3 ? 0.6 : 1.4);
        const f = 260 + Math.random() * 200;
        this.tone('sawtooth', f, f * 1.6, 0.3, 0.025 + size * 0.03);
      }
    }
  }

  stopCrowd(): void {
    this.crowdSource?.stop();
    this.crowdSource?.disconnect();
    this.crowdSource = null;
    this.crowdGain = null;
    this.crowdFilter = null;
  }

  // ─── Primitivas ───────────────────────────────────────────────────────

  private tone(type: OscillatorType, f0: number, f1: number, dur: number, vol: number, delay = 0): void {
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    envelope(gain, t, vol, dur);
    osc.connect(gain).connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  private burst(dur: number, vol: number, filter: BiquadFilterType, freq: number, q = 1, delay = 0): void {
    if (!this.ctx || !this.master || !this.noise) return;
    const t = this.ctx.currentTime + delay;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const biquad = this.ctx.createBiquadFilter();
    biquad.type = filter;
    biquad.frequency.value = freq;
    biquad.Q.value = q;
    const gain = this.ctx.createGain();
    envelope(gain, t, vol, dur);
    src.connect(biquad).connect(gain).connect(this.master);
    src.start(t, Math.random() * 1.5);
    src.stop(t + dur + 0.05);
  }
}

function envelope(gain: GainNode, t: number, peak: number, dur: number): void {
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + Math.min(0.01, dur / 4));
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
}

function readMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

/** Instancia única compartida por todo el juego. */
export const audio = new AudioEngine();
