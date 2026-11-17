/**
 * Bucle de paso fijo: la simulación avanza siempre en pasos de 1/30 s (determinista),
 * el render corre a los fps del monitor e interpola con `alpha`.
 */
export class GameLoop {
  readonly stepSeconds = 1 / 30;
  speed = 1;
  paused = false;

  private accumulator = 0;
  private last = 0;
  private frameId = 0;

  constructor(
    private readonly onStep: (dt: number) => void,
    private readonly onRender: (alpha: number, frameDt: number) => void,
  ) {}

  start(): void {
    this.last = performance.now();
    const tick = (now: number): void => {
      this.frameId = requestAnimationFrame(tick);
      const frameDt = Math.min((now - this.last) / 1000, 0.25);
      this.last = now;

      if (!this.paused) {
        this.accumulator += frameDt * this.speed;
        let steps = 0;
        while (this.accumulator >= this.stepSeconds && steps < 16) {
          this.onStep(this.stepSeconds);
          this.accumulator -= this.stepSeconds;
          steps++;
        }
        if (steps >= 16) this.accumulator = 0; // evita la "espiral de la muerte" en PCs lentos
      }
      this.onRender(this.paused ? 1 : this.accumulator / this.stepSeconds, frameDt);
    };
    this.frameId = requestAnimationFrame(tick);
  }

  stop(): void {
    cancelAnimationFrame(this.frameId);
  }
}
