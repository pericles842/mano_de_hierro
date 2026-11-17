import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Random } from '../core/Random';
import { RIOTS } from '../data/riots';
import type { RiotInstance } from '../sim/regime';
import { VOXEL_MATERIAL, getModel } from './models';
import { VoxelBuilder } from './voxel';

const N = 64;
const HALF = N / 2;

interface Island {
  land: THREE.BufferGeometry;
  decor: THREE.BufferGeometry;
  heights: Int8Array;
}

let islandCache: Island | null = null;

/** Isla voxel de Pomposia, generada con ruido (siempre la misma gracias a la semilla). */
function getIsland(): Island {
  if (islandCache) return islandCache;
  const noiseA = makeValueNoise(new Random(1987), 6);
  const noiseB = makeValueNoise(new Random(42), 13);
  const rng = new Random(7);
  const heights = new Int8Array(N * N);
  const land = new VoxelBuilder();
  const decor = new VoxelBuilder(); // voxels de 0,25 m: árboles y ciudad

  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      const wx = i - HALF + 0.5;
      const wz = j - HALF + 0.5;
      const r = Math.hypot(wx, wz * 1.2);
      const n = noiseA(i / N, j / N) * 0.65 + noiseB(i / N, j / N) * 0.35;
      let h = Math.round(1 + n * 7 - Math.max(0, r - 16) * 0.6);
      if (r < 14) h = Math.max(h, 2);
      const city = Math.hypot(wx, wz) < 5;
      if (city) h = 2;
      h = Math.min(h, 10);
      heights[j * N + i] = Math.max(0, h);
      if (h <= 0) continue;

      for (let y = 0; y < h; y++) {
        const color = y === h - 1 ? (city ? 0xa3a3a3 : topColor(h)) : y >= h - 3 ? 0x8a6f4d : 0x6b5a48;
        land.set(i - HALF, y, j - HALF, color);
      }

      const X = (i - HALF) * 4;
      const Z = (j - HALF) * 4;
      const Y = h * 4;
      if (city && Math.hypot(wx, wz) > 1.6 && rng.chance(0.7)) {
        const color = rng.pick([0xe9d8a6, 0xf4f1de, 0xe07a5f, 0xbcd4e6, 0xf2cc8f]);
        decor.box(X, Y, Z, X + 2, Y + rng.int(2, 7), Z + 2, color);
      } else if (!city && h >= 2 && h <= 5 && rng.chance(0.07)) {
        decor.box(X + 1, Y, Z + 1, X + 1, Y + 1, Z + 1, 0x7c4a21);
        decor.box(X, Y + 2, Z, X + 2, Y + 4, Z + 2, rng.chance(0.5) ? 0x3f8f3a : 0x4fa346);
      }
    }
  }
  // Palacio en miniatura en el centro de la capital.
  decor.box(-4, 8, -2, 3, 11, 1, 0xf2a7bb);
  decor.box(-1, 12, -1, 0, 13, 0, 0xe0b13a);
  decor.box(0, 14, 0, 0, 17, 0, 0x9ca3af).box(1, 16, 0, 2, 17, 0, 0x6c2bd9);

  islandCache = {
    land: land.build({ size: 1, jitter: 0.06 }),
    decor: decor.build({ size: 0.25, jitter: 0.05 }),
    heights,
  };
  return islandCache;
}

function topColor(h: number): number {
  if (h <= 1) return 0xe6d690;
  if (h <= 3) return 0x6fb34a;
  if (h <= 5) return 0x4e9a3a;
  if (h <= 7) return 0x8c8579;
  return 0xf4f4f4;
}

export function islandHeightAt(x: number, z: number): number {
  const i = Math.min(N - 1, Math.max(0, Math.floor(x + HALF)));
  const j = Math.min(N - 1, Math.max(0, Math.floor(z + HALF)));
  return getIsland().heights[j * N + i];
}

function makeValueNoise(rng: Random, g: number): (u: number, w: number) => number {
  const v = new Float32Array((g + 1) * (g + 1));
  for (let k = 0; k < v.length; k++) v[k] = rng.next();
  const at = (a: number, b: number): number => v[Math.min(b, g) * (g + 1) + Math.min(a, g)];
  return (u, w) => {
    const x = u * g;
    const y = w * g;
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const sx = (x - x0) * (x - x0) * (3 - 2 * (x - x0));
    const sy = (y - y0) * (y - y0) * (3 - 2 * (y - y0));
    const a = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * sx;
    const b = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * sx;
    return a + (b - a) * sy;
  };
}

interface Marker {
  uid: number;
  group: THREE.Group;
  baseY: number;
  anchor: THREE.Vector3;
}

export interface MarkerScreenPos {
  uid: number;
  x: number;
  y: number;
  visible: boolean;
}

/** Mapa del país con los focos de revuelta activos. */
export class CountryView {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(45, 1, 0.5, 500);
  private readonly controls: OrbitControls;
  private readonly markers: Marker[] = [];
  private readonly beamGeometry = new THREE.BoxGeometry(0.25, 10, 0.25);
  private readonly beamMaterial = new THREE.MeshBasicMaterial({ color: 0xff3b30, transparent: true, opacity: 0.35 });
  private readonly waterGeometry = new THREE.PlaneGeometry(400, 400);
  private readonly waterMaterial = new THREE.MeshLambertMaterial({ color: 0x2a78b5 });
  private readonly projected = new THREE.Vector3();
  private time = 0;

  constructor(dom: HTMLElement, riots: readonly RiotInstance[]) {
    this.scene.background = new THREE.Color(0x8ec5e8);
    this.scene.fog = new THREE.Fog(0x8ec5e8, 80, 180);
    this.camera.position.set(0, 40, 44);

    this.scene.add(new THREE.HemisphereLight(0xeaf4ff, 0x4a6a3a, 1.8));
    const sun = new THREE.DirectionalLight(0xfff2dc, 2.2);
    sun.position.set(-25, 50, 30);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -40, right: 40, top: 40, bottom: -40, near: 1, far: 150 });
    sun.shadow.normalBias = 0.03;
    this.scene.add(sun);

    const island = getIsland();
    for (const geometry of [island.land, island.decor]) {
      const mesh = new THREE.Mesh(geometry, VOXEL_MATERIAL);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.scene.add(mesh);
    }
    const water = new THREE.Mesh(this.waterGeometry, this.waterMaterial);
    water.rotation.x = -Math.PI / 2;
    water.position.y = 0.85;
    water.receiveShadow = true;
    this.scene.add(water);

    for (const riot of riots) {
      const { x, z } = RIOTS[riot.defId].mapPos;
      const h = islandHeightAt(x, z);
      const group = new THREE.Group();
      group.position.set(x, h, z);
      const flame = new THREE.Mesh(getModel('marker'), VOXEL_MATERIAL);
      flame.castShadow = true;
      const beam = new THREE.Mesh(this.beamGeometry, this.beamMaterial);
      beam.position.y = 5;
      group.add(flame, beam);
      this.scene.add(group);
      this.markers.push({ uid: riot.uid, group, baseY: h, anchor: new THREE.Vector3(x, h + 3.4, z) });
    }

    this.controls = new OrbitControls(this.camera, dom);
    this.controls.target.set(0, 2, 0);
    this.controls.enableDamping = true;
    this.controls.enablePan = false;
    this.controls.autoRotate = true;
    this.controls.autoRotateSpeed = 0.35;
    this.controls.minDistance = 25;
    this.controls.maxDistance = 80;
    this.controls.maxPolarAngle = 1.15;
  }

  setSize(width: number, height: number): void {
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  update(dt: number): void {
    this.time += dt;
    this.markers.forEach((m, i) => {
      m.group.position.y = m.baseY + Math.abs(Math.sin(this.time * 3 + i)) * 0.5;
      m.group.children[0].rotation.y += dt;
    });
    this.beamMaterial.opacity = 0.25 + Math.sin(this.time * 4) * 0.12;
    this.controls.update(dt);
  }

  render(renderer: THREE.WebGLRenderer): void {
    renderer.render(this.scene, this.camera);
  }

  markerScreenPositions(width: number, height: number): MarkerScreenPos[] {
    return this.markers.map((m) => {
      this.projected.copy(m.anchor).project(this.camera);
      return {
        uid: m.uid,
        x: (this.projected.x * 0.5 + 0.5) * width,
        y: (-this.projected.y * 0.5 + 0.5) * height,
        visible: this.projected.z < 1,
      };
    });
  }

  dispose(): void {
    this.controls.dispose();
    this.beamGeometry.dispose();
    this.beamMaterial.dispose();
    this.waterGeometry.dispose();
    this.waterMaterial.dispose();
    this.scene.clear();
  }
}
