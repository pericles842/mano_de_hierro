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
  getModel,
} from './models';
import { VoxelParticles } from './particles';
import { buildRiotEnvironment, type RiotEnvironment } from './riotEnvironment';

const SKY = 0xa9c7e0;
const HELI_ALTITUDE = 9;
const NIGHT_SKY = 0x0d1224;
const FLAME_COLORS = [0xff6a00, 0xffb300, 0xff3d00, 0xffd54a];

export interface GhostPlacement {
  x: number;
  z: number;
  valid: boolean;
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
  private readonly ringGeometry = new THREE.RingGeometry(1, 1.18, 32);
  private readonly ringMaterial = new THREE.MeshBasicMaterial({ color: 0xfacc15, transparent: true, opacity: 0.9 });
  private readonly markerMaterial = new THREE.MeshBasicMaterial({ color: 0x4ade80, transparent: true });
  /** Haz del reflector del helicóptero. */
  private readonly beamGeometry = new THREE.CylinderGeometry(0.4, 3.5, HELI_ALTITUDE, 16, 1, true);
  private readonly beamMaterial = new THREE.MeshBasicMaterial({
    color: 0xfff3b0,
    transparent: true,
    opacity: 0.13,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
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
  private readonly dummy = new THREE.Object3D();
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
      const mesh = new THREE.InstancedMesh(getModel(key), VOXEL_MATERIAL, Math.max(1, sim.total));
      mesh.frustumCulled = false; // las instancias se mueven: el bounding sphere no sirve
      mesh.castShadow = true;
      mesh.setColorAt(0, new THREE.Color(0xffffff));
      mesh.count = 0;
      this.scene.add(mesh);
      return mesh;
    });
    this.headings = new Float32Array(Math.max(1, sim.total)).fill(Math.PI);

    this.scene.add(this.particles.mesh);

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
    for (let i = 0; i < 4; i++) {
      this.particles.spawn({
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
      g.position.set(p.x, 0.02, p.z);
      g.rotation.y = heading;
      g.material = p.valid ? this.ghostOk : this.ghostBad;
    });
  }

  /** @param simDt tiempo de juego transcurrido (0 en pausa) para animaciones y partículas. */
  render(renderer: THREE.WebGLRenderer, alpha: number, simDt: number, selected: ReadonlySet<number>): void {
    this.time += simDt;
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
    for (const p of this.sim.protesters) {
      if (p.state === 'gone') continue;
      const speed = Math.hypot(p.vx, p.vz);
      if (p.state === 'occupying') this.headings[p.id] = Math.PI;
      else if (speed > 0.3) this.headings[p.id] = Math.atan2(p.vx, p.vz);

      let bob = 0;
      if (p.state === 'occupying' || (chanting && p.state !== 'fleeing')) bob = Math.abs(Math.sin(t * 6 + p.id)) * 0.25;
      else if (speed > 0.3) bob = Math.abs(Math.sin(t * 12 + p.id)) * 0.1;

      this.dummy.position.set(p.px + (p.x - p.px) * alpha, bob, p.pz + (p.z - p.pz) * alpha);
      this.dummy.rotation.y = this.headings[p.id];
      this.dummy.updateMatrix();
      const model = this.modelFor(p);
      const mesh = this.crowd[model];
      const idx = counts[model]++;
      mesh.setMatrixAt(idx, this.dummy.matrix);
      this.shade.setScalar(p.state === 'fleeing' ? 1.15 : 0.82 + ((p.id * 37) % 19) / 100);
      mesh.setColorAt(idx, this.shade);
    }
    this.crowd.forEach((mesh, i) => {
      mesh.count = counts[i];
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    });
  }

  private renderUnits(alpha: number, selected: ReadonlySet<number>): void {
    this.seen.clear();
    let ring = 0;
    for (const u of this.sim.units) {
      this.seen.add(u.id);
      let mesh = this.unitMeshes.get(u.id);
      if (!mesh) {
        mesh = this.createUnitMesh(u.type);
        this.scene.add(mesh);
        this.unitMeshes.set(u.id, mesh);
      }
      const x = u.px + (u.x - u.px) * alpha;
      const z = u.pz + (u.z - u.pz) * alpha;
      const flying = UNITS[u.type].flying === true;
      mesh.position.set(x, flying ? HELI_ALTITUDE + Math.sin(this.time * 2 + u.id) * 0.3 : 0, z);
      mesh.rotation.y = u.heading;
      if (flying) {
        const rotor = mesh.getObjectByName('rotor');
        if (rotor) rotor.rotation.y = this.time * 25;
      }

      if (selected.has(u.id)) {
        const def = UNITS[u.type];
        const r = this.ringAt(ring++);
        r.visible = true;
        r.position.set(x, 0.06, z);
        r.scale.setScalar(def.halfLength + def.radius + 0.4);
      }
    }
    for (let i = ring; i < this.selectionRings.length; i++) this.selectionRings[i].visible = false;
    for (const [id, mesh] of this.unitMeshes) {
      if (this.seen.has(id)) continue;
      this.scene.remove(mesh);
      this.unitMeshes.delete(id);
    }
  }

  private createUnitMesh(type: UnitType): THREE.Mesh {
    const mesh = new THREE.Mesh(getModel(type), VOXEL_MATERIAL);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    if (type === 'helicopter') {
      const rotor = new THREE.Mesh(getModel('rotor'), VOXEL_MATERIAL);
      rotor.name = 'rotor';
      rotor.position.y = 2.6;
      const beam = new THREE.Mesh(this.beamGeometry, this.beamMaterial);
      beam.position.y = -HELI_ALTITUDE / 2;
      mesh.add(rotor, beam);
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
        this.particles.spawn({
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
    this.crowd.forEach((m) => m.dispose());
    this.ringGeometry.dispose();
    this.ringMaterial.dispose();
    this.markerMaterial.dispose();
    this.ghostOk.dispose();
    this.ghostBad.dispose();
    this.beamGeometry.dispose();
    this.beamMaterial.dispose();
    this.scene.clear();
  }
}

function ghostMaterial(color: number): THREE.MeshLambertMaterial {
  return new THREE.MeshLambertMaterial({ vertexColors: true, color, transparent: true, opacity: 0.5, depthWrite: false });
}
