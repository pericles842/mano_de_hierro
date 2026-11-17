import * as THREE from 'three';
import { UNITS, type UnitType } from '../data/units';
import type { RiotSim } from '../sim/riot/RiotSim';
import type { Protester, RiotEvent } from '../sim/riot/types';
import {
  CROWD_MODELS,
  MODEL_ESCUDERO,
  MODEL_MEDICO,
  MODEL_MOLOTOV,
  MODEL_PALO,
  MODEL_PRENSA,
  VOXEL_MATERIAL,
  gearFrom,
  getModel,
  getUnitModel,
} from './models';
import { VoxelParticles } from './particles';
import { buildRiotEnvironment, type RiotEnvironment } from './riotEnvironment';
import { SoundWaves } from './soundWaves';
import { FORCE_GATES } from '../data/forceLevels';

/** Las marcas de manifestantes comparten temporizadores con las tropas: desplazar sus ids. */
const PROTESTER_FX_ID = 1_000_000;

const SKY = 0xa9c7e0;
const HELI_ALTITUDE = 9;
/** Altura de la azotea del palacio (francotiradores). */
const ROOF_Y = 7.5;
const NIGHT_SKY = 0x0d1224;
const FLAME_COLORS = [0xff6a00, 0xffb300, 0xff3d00, 0xffd54a];

export interface GhostPlacement {
  x: number;
  z: number;
  valid: boolean;
  /** Altura (azotea del palacio para francotiradores). */
  y?: number;
}

/** Dibuja una RiotSim. Solo lee el estado de la simulación; nunca lo modifica. */
export class RiotView {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(50, 1, 0.5, 500);

  private readonly env: RiotEnvironment;
  private readonly crowd: THREE.InstancedMesh[];
  private readonly headings: Float32Array;
  private readonly unitMeshes = new Map<number, THREE.Mesh>();
  private readonly seen = new Set<number>();
  private readonly particles = new VoxelParticles(4000);
  /** Nube de gas lacrimógeno: translúcida para que se vea lo que pasa dentro (palizas, arrestos). */
  private readonly gasFx = new VoxelParticles(2500, 0.32);
  private readonly ringGeometry = new THREE.RingGeometry(1, 1.18, 32);
  private readonly ringMaterial = new THREE.MeshBasicMaterial({ color: 0xfacc15, transparent: true, opacity: 0.9 });
  private readonly markerMaterial = new THREE.MeshBasicMaterial({ color: 0x4ade80, transparent: true });
  /** Charcos de sangre bajo los caídos (estilo voxel, sin gore). */
  private readonly blood: THREE.InstancedMesh;
  private readonly bloodGeometry = new THREE.BoxGeometry(1, 0.04, 1);
  private readonly bloodMaterial = new THREE.MeshLambertMaterial({ color: 0x7f1d1d });
  /** Rombos amarillos sobre los líderes marcados por el helicóptero. */
  private readonly marks: THREE.InstancedMesh;
  private readonly markGeometry = new THREE.OctahedronGeometry(0.22);
  private readonly markMaterial = new THREE.MeshBasicMaterial({ color: 0xfacc15 });
  /** Cuerpos de agentes caídos. */
  private readonly unitBodies: THREE.Mesh[] = [];
  /** Zona de miedo de la tanqueta. */
  private readonly fearRingGeometry = new THREE.RingGeometry(9.6, 10, 48);
  private readonly fearRingMaterial = new THREE.MeshBasicMaterial({ color: 0xef4444, transparent: true, opacity: 0.3, depthWrite: false });
  private readonly ghostOk = ghostMaterial(0xffffff);
  private readonly ghostBad = ghostMaterial(0xff4444);
  private readonly ghosts: THREE.Mesh[] = [];
  private ghostType: UnitType | null = null;
  private readonly selectionRings: THREE.Mesh[] = [];
  private readonly moveMarker: THREE.Mesh;
  private markerLife = 0;
  private smokeAccumulator = 0;
  private fireAccumulator = 0;
  private time = 0;
  private frameSimDt = 0;
  /** Ondas rojas: megáfono del negociador y agentes repeliendo. */
  private readonly waves = new SoundWaves(this.particles);
  private readonly dummy = new THREE.Object3D();
  private readonly dummy2 = new THREE.Object3D();
  private readonly shade = new THREE.Color();

  constructor(private readonly sim: RiotSim) {
    const night = sim.def.night === true;
    const sky = night ? NIGHT_SKY : SKY;
    this.scene.background = new THREE.Color(sky);
    this.scene.fog = new THREE.Fog(sky, night ? 70 : 110, night ? 170 : 230);
    this.camera.position.set(0, 46, 60);
    this.camera.lookAt(0, 0, 9);

    this.scene.add(night ? new THREE.HemisphereLight(0x5a6bc4, 0x15151f, 0.55) : new THREE.HemisphereLight(0xe8f1ff, 0x7a6a55, 1.7));
    const sun = night ? new THREE.DirectionalLight(0x9fb4ff, 0.7) : new THREE.DirectionalLight(0xfff0d9, 2.4);
    if (night) {
      // Apagón: el palacio es el único edificio iluminado de la ciudad.
      for (const x of [-7, 7]) {
        const light = new THREE.PointLight(0xffc977, 60, 32, 1.4);
        light.position.set(x, 6, -18);
        this.scene.add(light);
      }
    }
    sun.position.set(35, 60, 25);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -60, right: 60, top: 60, bottom: -60, near: 1, far: 200 });
    sun.shadow.bias = -0.0008;
    sun.shadow.normalBias = 0.03;
    this.scene.add(sun, sun.target);

    this.env = buildRiotEnvironment(1234);
    this.scene.add(this.env.group);

    this.crowd = CROWD_MODELS.map((key) => {
      const mesh = new THREE.InstancedMesh(getModel(key), VOXEL_MATERIAL, Math.max(1, sim.total + 40));
      mesh.frustumCulled = false; // las instancias se mueven: el bounding sphere no sirve
      mesh.castShadow = true;
      mesh.setColorAt(0, new THREE.Color(0xffffff));
      mesh.count = 0;
      this.scene.add(mesh);
      return mesh;
    });
    this.headings = new Float32Array(Math.max(1, sim.total + 40)).fill(Math.PI);
    this.dummy.rotation.order = 'YXZ';

    this.blood = new THREE.InstancedMesh(this.bloodGeometry, this.bloodMaterial, Math.max(1, sim.total + 60));
    this.blood.frustumCulled = false;
    this.blood.receiveShadow = true;
    this.blood.count = 0;
    this.marks = new THREE.InstancedMesh(this.markGeometry, this.markMaterial, 32);
    this.marks.frustumCulled = false;
    this.marks.count = 0;
    this.scene.add(this.blood, this.marks);

    this.scene.add(this.particles.mesh);
    this.gasFx.mesh.renderOrder = 4;
    this.scene.add(this.gasFx.mesh);

    this.moveMarker = new THREE.Mesh(this.ringGeometry, this.markerMaterial);
    this.moveMarker.rotation.x = -Math.PI / 2;
    this.moveMarker.visible = false;
    this.scene.add(this.moveMarker);
  }

  setSize(width: number, height: number): void {
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  handleEvents(events: readonly RiotEvent[]): void {
    const fx = this.particles;
    for (const e of events) {
      switch (e.type) {
        case 'throw':
          fx.ballistic(e.fromX, 1.6, e.fromZ, e.toX, 1, e.toZ, 12, 0x7a5230, 0.2);
          break;
        case 'molotov':
          fx.ballistic(e.fromX, 2, e.fromZ, e.toX, 0.3, e.toZ, 10, 0x16a34a, 0.22);
          fx.ballistic(e.fromX, 2.2, e.fromZ, e.toX, 0.4, e.toZ, 10, 0xff7a00, 0.16);
          fx.burst(e.toX, 0.5, e.toZ, 14, 0xff6a00, 4, 0.3, 0.6);
          break;
        case 'tire':
          fx.burst(e.x, 0.4, e.z, 8, 0x1f1f1f, 2, 0.35, 0.8);
          break;
        case 'gas':
          fx.ballistic(e.fromX, 1.6, e.fromZ, e.toX, 0.2, e.toZ, 14, 0x6b7280, 0.2);
          break;
        case 'shot':
          fx.ballistic(e.fromX, 1.1, e.fromZ, e.toX, 1, e.toZ, 40, 0xffd34d, 0.1);
          fx.burst(e.fromX + Math.sign(e.toX - e.fromX) * 0.4, 1.1, e.fromZ + Math.sign(e.toZ - e.fromZ) * 0.4, 3, 0xffb347, 3, 0.12, 0.15);
          break;
        case 'arrest':
          fx.burst(e.x, 1.2, e.z, 10, 0x3b82f6, 2.5, 0.2, 0.6);
          break;
        case 'rescue':
          fx.burst(e.x, 1.5, e.z, 6, 0xef4444, 1.5, 0.15, 0.6);
          break;
        case 'press':
          for (let i = 0; i < 5; i++) fx.burst(e.x, 2, e.z, 1, 0xffffff, 1, 0.18, 0.25); // flashes de cámara
          break;
        case 'extinguish':
          fx.burst(e.x, 0.5, e.z, 12, 0x9ca3af, 2.5, 0.35, 1);
          break;
        case 'desert':
          fx.burst(e.x, 1.5, e.z, 14, 0x4d5b2e, 3, 0.25, 0.9);
          break;
        case 'liveShot': {
          const fy = e.fromZ < -22.5 ? ROOF_Y + 0.3 : 1.3; // francotirador en la azotea
          fx.ballistic(e.fromX, fy, e.fromZ, e.toX, 1, e.toZ, 60, 0xfff7c2, 0.08);
          const dx = Math.sign(e.toX - e.fromX) * 0.5;
          const dz = Math.sign(e.toZ - e.fromZ) * 0.5;
          fx.burst(e.fromX + dx, fy, e.fromZ + dz, 4, 0xffc247, 3, 0.12, 0.12); // fogonazo
          if (e.result !== 'miss') fx.burst(e.toX, 1, e.toZ, e.result === 'kill' ? 6 : 3, 0xb91c1c, 1.8, 0.12, 0.5);
          break;
        }
        case 'gunshot':
          fx.ballistic(e.fromX, 1.4, e.fromZ, e.toX, 1, e.toZ, 55, 0xffa94d, 0.08);
          fx.burst(e.toX, 1, e.toZ, 4, 0xb91c1c, 1.8, 0.12, 0.5);
          break;
        case 'soldierDown':
          fx.burst(e.x, 1, e.z, 8, 0xb91c1c, 2, 0.14, 0.6);
          break;
        case 'charge':
          fx.burst(e.x, 0.3, e.z, 10, 0xa8a29e, 3, 0.3, 0.7);
          break;
        case 'killed':
        case 'martyr':
        case 'openFire':
        case 'refuse':
        case 'retreat':
        case 'deployed':
          break;
        case 'spray':
          for (let k = 0; k < 3; k++) {
            fx.ballistic(
              e.fromX, 2.7, e.fromZ,
              e.toX + (Math.random() - 0.5) * 2, 0.2, e.toZ + (Math.random() - 0.5) * 2,
              16, k % 2 ? 0x8fd3ff : 0xd6f1ff, 0.22,
            );
          }
          if (Math.random() < 0.35) fx.burst(e.toX, 0.2, e.toZ, 3, 0xbfe6ff, 2.5, 0.18, 0.5);
          break;
        case 'impact':
          this.impact(e.x, e.z, e.level);
          break;
        case 'disperse':
          fx.burst(e.x, 1.8, e.z, 2, 0xffffff, 1.5, 0.12, 0.5);
          break;
        case 'bite':
          fx.burst(e.x, 0.6, e.z, 4, 0xdc2626, 1.5, 0.1, 0.35); // mordisco
          break;
        case 'pepper': {
          // Chorro de pimienta: cubitos naranjas en cono hacia delante.
          const dx = e.toX - e.fromX;
          const dz = e.toZ - e.fromZ;
          for (let k = 0; k < 10; k++) {
            const sp = 0.6 + Math.random() * 0.6;
            fx.spawn({
              x: e.fromX + dx * 0.2, y: 1.1, z: e.fromZ + dz * 0.2,
              vx: dx * sp * 1.6 + (Math.random() - 0.5) * 1.2, vy: Math.random() * 0.4, vz: dz * sp * 1.6 + (Math.random() - 0.5) * 1.2,
              life: 0.6, size: 0.16, sizeEnd: 0.45, color: k % 2 ? 0xf97316 : 0xfb923c, drag: 2,
            });
          }
          break;
        }
        case 'flash':
          fx.ballistic(e.fromX, 1.3, e.fromZ, e.toX, 0.3, e.toZ, 14, 0x374151, 0.12); // granada
          fx.burst(e.toX, 1, e.toZ, 18, 0xffffff, 6, 0.22, 0.25); // destello
          fx.burst(e.toX, 0.8, e.toZ, 8, 0xfde68a, 3, 0.16, 0.4);
          break;
        case 'leaderDown':
          fx.burst(e.x, 1.6, e.z, 10, 0xfacc15, 2, 0.14, 0.6); // cae el megáfono
          break;
        case 'jam':
          break;
        case 'beating':
          // Cada golpe: chispa blanca del impacto, gotitas rojas y polvo del suelo.
          fx.burst(e.x, 0.5, e.z, 3, 0xffffff, 2.2, 0.1, 0.18);
          fx.burst(e.x, 0.4, e.z, 4, 0xdc2626, 1.4, 0.11, 0.4);
          fx.burst(e.x, 0.15, e.z, 3, 0xa8a29e, 1.2, 0.18, 0.45);
          break;
        case 'unitBroken':
          fx.burst(e.x, 1, e.z, 16, e.unitType === 'tanqueta' ? 0x5b6b3a : 0x9ca3af, 4, 0.3, 1.2);
          break;
        case 'escalate':
        case 'wave':
        case 'marchStart':
          break;
      }
    }
  }

  private impact(x: number, z: number, level: number): void {
    // Humo del choque: translúcido, como el gas, para que se vea lo que pasa debajo.
    for (let i = 0; i < 4; i++) {
      this.gasFx.spawn({
        x: x + (Math.random() - 0.5) * 1.5,
        y: 0.6,
        z: z + (Math.random() - 0.5) * 1.5,
        vx: (Math.random() - 0.5) * 0.8,
        vy: 0.5 + Math.random() * 0.5,
        vz: (Math.random() - 0.5) * 0.8,
        life: 1.4 + Math.random(),
        size: 0.5,
        sizeEnd: 1.6,
        color: 0xd8dde3,
        drag: 0.5,
      });
    }
    if (level >= 2) {
      const color = level >= 3 ? 0xff7b3a : 0xffd34d;
      for (let i = 0; i < 5 + level * 2; i++) {
        const a = Math.random() * Math.PI * 2;
        this.particles.spawn({
          x, y: 1.2, z,
          vx: Math.cos(a) * 9, vy: Math.random() * 2, vz: Math.sin(a) * 9,
          life: 0.18, size: 0.14, sizeEnd: 0.05, color,
        });
      }
    }
  }

  showMoveMarker(x: number, z: number): void {
    this.moveMarker.position.set(x, 0.06, z);
    this.markerLife = 1;
  }

  /** Vista previa transparente de las tropas a colocar (una o una hilera). */
  setGhosts(type: UnitType | null, placements: readonly GhostPlacement[] = [], heading = 0): void {
    if (type !== this.ghostType) {
      for (const g of this.ghosts) this.scene.remove(g);
      this.ghosts.length = 0;
      this.ghostType = type;
    }
    if (!type) return;
    while (this.ghosts.length < placements.length) {
      const g = new THREE.Mesh(getModel(type), this.ghostOk);
      g.renderOrder = 2;
      this.scene.add(g);
      this.ghosts.push(g);
    }
    this.ghosts.forEach((g, i) => {
      const p = placements[i];
      g.visible = p !== undefined;
      if (!p) return;
      g.position.set(p.x, p.y ?? 0.02, p.z);
      g.rotation.y = heading;
      g.material = p.valid ? this.ghostOk : this.ghostBad;
    });
  }

  /** @param simDt tiempo de juego transcurrido (0 en pausa) para animaciones y partículas. */
  render(renderer: THREE.WebGLRenderer, alpha: number, simDt: number, selected: ReadonlySet<number>): void {
    this.time += simDt;
    this.frameSimDt = simDt;
    this.renderCrowd(alpha);
    this.renderUnits(alpha, selected);

    if (this.markerLife > 0) {
      this.markerLife = Math.max(0, this.markerLife - simDt * 1.5 - 0.01);
      this.moveMarker.visible = true;
      this.markerMaterial.opacity = this.markerLife;
      this.moveMarker.scale.setScalar(0.5 + (1 - this.markerLife) * 0.8);
    } else {
      this.moveMarker.visible = false;
    }

    this.palaceSmoke(simDt);
    this.fireParticles(simDt);
    this.gasParticles(simDt);
    this.particles.update(simDt);
    this.gasFx.update(simDt);
    renderer.render(this.scene, this.camera);
  }

  private modelFor(p: Protester): number {
    if (p.kind === 'escudero') return MODEL_ESCUDERO;
    if (p.kind === 'prensa') return MODEL_PRENSA;
    if (p.kind === 'medico') return MODEL_MEDICO;
    if (p.weapon === 'palo') return MODEL_PALO;
    if (p.weapon === 'molotov') return MODEL_MOLOTOV;
    return p.model;
  }

  private renderCrowd(alpha: number): void {
    const counts = new Array<number>(this.crowd.length).fill(0);
    const t = this.time;
    const chanting = this.sim.chanting;
    let bloodCount = 0;
    let markCount = 0;
    for (const p of this.sim.protesters) {
      if (p.state === 'gone') continue;
      const down = p.state === 'dead' || p.state === 'injured';
      const speed = Math.hypot(p.vx, p.vz);
      if (p.state === 'occupying') this.headings[p.id] = Math.PI;
      else if (!down && speed > 0.3) this.headings[p.id] = Math.atan2(p.vx, p.vz);
      const heading = this.headings[p.id];
      const x = down ? p.x : p.px + (p.x - p.px) * alpha;
      const z = down ? p.z : p.pz + (p.z - p.pz) * alpha;

      if (down) {
        // Tendido en el suelo.
        this.dummy.position.set(x, 0.2, z);
        this.dummy.rotation.set(-Math.PI / 2, heading, 0);
        if (bloodCount < this.blood.instanceMatrix.count) {
          const size = p.state === 'dead' ? 1.3 + ((p.id * 13) % 7) / 10 : 0.6;
          this.bloodDummy(x - Math.sin(heading) * 0.8, z - Math.cos(heading) * 0.8, size, p.id);
          this.blood.setMatrixAt(bloodCount++, this.dummy2.matrix);
        }
      } else {
        let bob = 0;
        if (p.state === 'occupying' || (chanting && p.state !== 'fleeing')) bob = Math.abs(Math.sin(t * 6 + p.id)) * 0.25;
        else if (speed > 0.3) bob = Math.abs(Math.sin(t * 12 + p.id)) * 0.1;
        this.dummy.position.set(x, bob, z);
        this.dummy.rotation.set(0, heading, 0);
        if (p.marked > 0 && markCount < 32) {
          this.dummy2.position.set(x, 2.3 + Math.sin(t * 5) * 0.1, z);
          this.dummy2.rotation.set(0, t * 3, 0);
          this.dummy2.scale.setScalar(1);
          this.dummy2.updateMatrix();
          this.marks.setMatrixAt(markCount++, this.dummy2.matrix);
        }
      }
      this.dummy.updateMatrix();
      // Marcas por clase: el líder arenga, la prensa dispara flashes, el médico brilla en verde.
      if (!down && p.state !== 'fleeing') {
        const fxKind = p.kind === 'lider' ? 'leader' : p.kind === 'prensa' ? 'flash' : p.kind === 'medico' ? 'medic' : null;
        if (fxKind) this.waves.emit(PROTESTER_FX_ID + p.id, fxKind, x, z, heading, this.frameSimDt);
        if (p.stunned > 0) this.waves.emit(PROTESTER_FX_ID * 2 + p.id, 'stun', x, z, heading, this.frameSimDt); // aturdido
      }
      const model = this.modelFor(p);
      const mesh = this.crowd[model];
      const idx = counts[model]++;
      mesh.setMatrixAt(idx, this.dummy.matrix);
      const shade = p.state === 'dead' ? 0.55 : p.state === 'fleeing' ? 1.15 : 0.82 + ((p.id * 37) % 19) / 100;
      this.shade.setScalar(shade);
      mesh.setColorAt(idx, this.shade);
    }
    for (const body of this.sim.bodies) {
      if (bloodCount >= this.blood.instanceMatrix.count) break;
      this.bloodDummy(body.x, body.z, 1.6, Math.round(body.x * 10));
      this.blood.setMatrixAt(bloodCount++, this.dummy2.matrix);
    }
    this.blood.count = bloodCount;
    this.blood.instanceMatrix.needsUpdate = true;
    this.marks.count = markCount;
    this.marks.instanceMatrix.needsUpdate = true;
    this.crowd.forEach((mesh, i) => {
      mesh.count = counts[i];
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    });
  }

  /** Charco de sangre plano en el suelo (tamaño y giro pseudoaleatorios por semilla). */
  private bloodDummy(x: number, z: number, size: number, seed: number): void {
    this.dummy2.position.set(x, 0.03, z);
    this.dummy2.rotation.set(0, (seed * 0.7) % Math.PI, 0);
    this.dummy2.scale.set(size, 1, size * 0.8);
    this.dummy2.updateMatrix();
  }

  private renderUnits(alpha: number, selected: ReadonlySet<number>): void {
    this.seen.clear();
    let ring = 0;
    const gear = gearFrom(this.sim.upgrades, this.sim.forceLevel >= FORCE_GATES.lethal);
    // Cuerpos de agentes caídos.
    while (this.unitBodies.length < this.sim.bodies.length) {
      const body = this.sim.bodies[this.unitBodies.length];
      const mesh = new THREE.Mesh(getUnitModel(body.type, gear), VOXEL_MATERIAL);
      mesh.rotation.order = 'YXZ';
      mesh.rotation.set(-Math.PI / 2, body.heading, 0);
      mesh.position.set(body.x, 0.25, body.z);
      mesh.castShadow = true;
      this.scene.add(mesh);
      this.unitBodies.push(mesh);
    }
    for (const u of this.sim.units) {
      this.seen.add(u.id);
      let mesh = this.unitMeshes.get(u.id);
      if (!mesh) {
        mesh = this.createUnitMesh(u.type);
        this.scene.add(mesh);
        this.unitMeshes.set(u.id, mesh);
      }
      // El equipo cambia a la vista: porra/bate, visera, máscara, escudo, pistola con mano dura y barricada mejorada.
      if (u.type === 'soldier' || u.type === 'shield' || u.type === 'barricade') {
        const geometry = getUnitModel(u.type, gear);
        if (mesh.geometry !== geometry) mesh.geometry = geometry;
      }
      const x = u.px + (u.x - u.px) * alpha;
      const z = u.pz + (u.z - u.pz) * alpha;
      const flying = UNITS[u.type].flying === true;
      // Golpe con el escudo / empujón: la tropa embiste hacia delante a ratos mientras repele.
      const beating = u.beatTimer > 0;
      // Golpe: subir y bajar el brazo (porra) o embestir con el escudo, rápido y seco.
      const strike = beating ? Math.abs(Math.sin(this.time * (Math.PI / 0.45))) : 0;
      const lunge = beating
        ? strike * (u.type === 'shield' ? 0.35 : 0.25)
        : u.pushing ? Math.max(0, Math.sin(this.time * 9 + u.id)) * (u.type === 'shield' ? 0.22 : 0.14) : 0;
      mesh.position.set(
        x + Math.sin(u.heading) * lunge,
        u.type === 'sniper' ? ROOF_Y : flying ? HELI_ALTITUDE + Math.sin(this.time * 2 + u.id) * 0.3 : 0,
        z + Math.cos(u.heading) * lunge,
      );
      mesh.rotation.y = u.heading;
      mesh.rotation.x = beating ? strike * 0.35 : 0; // se inclina sobre el que está en el suelo

      if (u.talking) this.waves.emit(u.id, 'megaphone', x, z, u.heading, this.frameSimDt);
      else if (u.pushing) this.waves.emit(u.id, 'push', x, z, u.heading, this.frameSimDt);
      else this.waves.idle(u.id);

      if (selected.has(u.id)) {
        const def = UNITS[u.type];
        const r = this.ringAt(ring++);
        r.visible = true;
        r.position.set(x, u.type === 'sniper' ? ROOF_Y + 0.06 : 0.06, z);
        r.scale.setScalar(def.halfLength + def.radius + 0.4);
      }
    }
    for (let i = ring; i < this.selectionRings.length; i++) this.selectionRings[i].visible = false;
    for (const [id, mesh] of this.unitMeshes) {
      if (this.seen.has(id)) continue;
      this.scene.remove(mesh);
      this.unitMeshes.delete(id);
      this.waves.idle(id, false);
    }
  }

  private createUnitMesh(type: UnitType): THREE.Mesh {
    const mesh = new THREE.Mesh(getModel(type), VOXEL_MATERIAL);
    mesh.rotation.order = 'YXZ'; // inclinación (x) relativa a hacia dónde mira (y)
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    if (type === 'tanqueta') {
      const ring = new THREE.Mesh(this.fearRingGeometry, this.fearRingMaterial);
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.05;
      mesh.add(ring);
    }
    return mesh;
  }

  private gasParticles(dt: number): void {
    for (const g of this.sim.gasClouds) {
      const fade = g.life / g.maxLife;
      const rate = dt * 30 * fade;
      const n = Math.floor(rate) + (Math.random() < rate % 1 ? 1 : 0);
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const r = Math.sqrt(Math.random()) * g.r;
        this.gasFx.spawn({
          x: g.x + Math.cos(a) * r,
          y: 0.3 + Math.random() * 0.8,
          z: g.z + Math.sin(a) * r,
          vx: this.sim.wind.x + (Math.random() - 0.5) * 0.3,
          vy: 0.25 + Math.random() * 0.3,
          vz: this.sim.wind.z + (Math.random() - 0.5) * 0.3,
          life: 1.2 + Math.random() * 0.8,
          size: 0.6,
          sizeEnd: 1.5,
          color: Math.random() < 0.5 ? 0xe5e7eb : 0xd9f99d,
          drag: 0.3,
        });
      }
    }
  }

  private ringAt(i: number): THREE.Mesh {
    while (this.selectionRings.length <= i) {
      const r = new THREE.Mesh(this.ringGeometry, this.ringMaterial);
      r.rotation.x = -Math.PI / 2;
      this.scene.add(r);
      this.selectionRings.push(r);
    }
    return this.selectionRings[i];
  }

  private fireParticles(dt: number): void {
    if (this.sim.fires.length === 0) return;
    this.fireAccumulator += dt * 40 * this.sim.fires.length;
    while (this.fireAccumulator > 1) {
      this.fireAccumulator -= 1;
      const f = this.sim.fires[Math.floor(Math.random() * this.sim.fires.length)];
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * f.r;
      const smoke = Math.random() < (f.kind === 'tire' ? 0.45 : 0.15); // los cauchos echan humo negro
      this.particles.spawn({
        x: f.x + Math.cos(a) * r,
        y: 0.2,
        z: f.z + Math.sin(a) * r,
        vx: (Math.random() - 0.5) * 0.5,
        vy: smoke ? 2 : 2 + Math.random() * 2,
        vz: (Math.random() - 0.5) * 0.5,
        life: smoke ? 2 : 0.5 + Math.random() * 0.4,
        size: smoke ? 0.5 : 0.4,
        sizeEnd: smoke ? 1.4 : 0.05,
        color: smoke ? 0x3f3f46 : FLAME_COLORS[Math.floor(Math.random() * FLAME_COLORS.length)],
        drag: 0.3,
      });
    }
  }

  private palaceSmoke(dt: number): void {
    if (this.sim.palaceHp >= 75) return;
    this.smokeAccumulator += dt * (75 - this.sim.palaceHp) * 0.35;
    while (this.smokeAccumulator > 1) {
      this.smokeAccumulator -= 1;
      this.particles.spawn({
        x: (Math.random() - 0.5) * 16,
        y: 4 + Math.random() * 3,
        z: -22.5 + Math.random(),
        vx: (Math.random() - 0.5) * 0.4,
        vy: 1.5 + Math.random(),
        vz: Math.random() * 0.4,
        life: 2 + Math.random() * 1.5,
        size: 0.6,
        sizeEnd: 1.8,
        color: Math.random() < 0.5 ? 0x3f3f46 : 0x52525b,
        drag: 0.2,
      });
    }
  }

  dispose(): void {
    this.env.dispose();
    this.particles.dispose();
    this.gasFx.dispose();
    this.crowd.forEach((m) => m.dispose());
    this.ringGeometry.dispose();
    this.ringMaterial.dispose();
    this.markerMaterial.dispose();
    this.ghostOk.dispose();
    this.ghostBad.dispose();
    this.blood.dispose();
    this.bloodGeometry.dispose();
    this.bloodMaterial.dispose();
    this.marks.dispose();
    this.markGeometry.dispose();
    this.markMaterial.dispose();
    this.fearRingGeometry.dispose();
    this.fearRingMaterial.dispose();
    this.scene.clear();
  }
}

function ghostMaterial(color: number): THREE.MeshLambertMaterial {
  return new THREE.MeshLambertMaterial({ vertexColors: true, color, transparent: true, opacity: 0.5, depthWrite: false });
}
