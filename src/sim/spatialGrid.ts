/** Rejilla espacial uniforme: encuentra vecinos cercanos sin comparar todos contra todos. */
export class SpatialGrid {
  private readonly cells: number[][];

  constructor(
    private readonly cellSize: number,
    private readonly minX: number,
    private readonly minZ: number,
    private readonly cols: number,
    private readonly rows: number,
  ) {
    this.cells = Array.from({ length: cols * rows }, () => []);
  }

  clear(): void {
    for (const cell of this.cells) cell.length = 0;
  }

  insert(id: number, x: number, z: number): void {
    this.cells[this.cellZ(z) * this.cols + this.cellX(x)].push(id);
  }

  /** Devuelve candidatos en el cuadrado que contiene el círculo (x, z, r). El llamador filtra por distancia. */
  query(x: number, z: number, r: number, out: number[]): number[] {
    out.length = 0;
    const x0 = this.cellX(x - r);
    const x1 = this.cellX(x + r);
    const z0 = this.cellZ(z - r);
    const z1 = this.cellZ(z + r);
    for (let cz = z0; cz <= z1; cz++) {
      for (let cx = x0; cx <= x1; cx++) {
        const cell = this.cells[cz * this.cols + cx];
        for (let i = 0; i < cell.length; i++) out.push(cell[i]);
      }
    }
    return out;
  }

  private cellX(x: number): number {
    return Math.min(this.cols - 1, Math.max(0, Math.floor((x - this.minX) / this.cellSize)));
  }

  private cellZ(z: number): number {
    return Math.min(this.rows - 1, Math.max(0, Math.floor((z - this.minZ) / this.cellSize)));
  }
}
