/** Una pantalla del juego (mapa del país, revuelta...). El Game solo tiene una activa. */
export interface Screen {
  step?(dt: number): void;
  render(alpha: number, frameDt: number): void;
  resize(width: number, height: number): void;
  dispose(): void;
}
