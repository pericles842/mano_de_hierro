import * as THREE from 'three';
import { MapControls } from 'three/examples/jsm/controls/MapControls.js';

export interface CameraBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

const EDGE_PX = 10;

/**
 * Cámara de estrategia. El clic izquierdo queda libre para seleccionar con recuadro y el derecho para dar órdenes.
 * Mover: WASD/flechas, botón central arrastrando o llevar el ratón al borde de la pantalla.
 * Rotar: Q/E. Zoom: rueda.
 */
export class RtsCamera {
  readonly controls: MapControls;
  private readonly keys = new Set<string>();
  private readonly forward = new THREE.Vector3();
  private readonly offset = new THREE.Vector3();
  private mouse: { x: number; y: number } | null = null;
  private readonly onKeyDown = (e: KeyboardEvent): void => {
    if (!(e.target instanceof HTMLInputElement)) this.keys.add(e.code);
  };
  private readonly onKeyUp = (e: KeyboardEvent): void => {
    this.keys.delete(e.code);
  };
  private readonly onBlur = (): void => {
    this.keys.clear();
    this.mouse = null;
  };
  private readonly onMouseMove = (e: PointerEvent): void => {
    this.mouse = { x: e.clientX, y: e.clientY };
  };
  private readonly onMouseOut = (e: MouseEvent): void => {
    if (!e.relatedTarget) this.mouse = null; // el ratón salió de la ventana
  };

  constructor(
    private readonly camera: THREE.PerspectiveCamera,
    dom: HTMLElement,
    private readonly bounds: CameraBounds,
  ) {
    this.controls = new MapControls(camera, dom);
    this.controls.target.set(0, 0, 9);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.12;
    this.controls.screenSpacePanning = false;
    this.controls.minDistance = 16;
    this.controls.maxDistance = 85;
    this.controls.minPolarAngle = 0.25;
    this.controls.maxPolarAngle = 1.15;
    this.controls.mouseButtons = { LEFT: null, MIDDLE: THREE.MOUSE.PAN, RIGHT: null };
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    window.addEventListener('pointermove', this.onMouseMove);
    document.addEventListener('mouseout', this.onMouseOut);
  }

  update(dt: number): void {
    const target = this.controls.target;
    this.forward.subVectors(target, this.camera.position).setY(0).normalize();
    const rightX = -this.forward.z;
    const rightZ = this.forward.x;
    const speed = 30 * dt * (this.camera.position.distanceTo(target) / 50);

    let mx = 0;
    let mz = 0;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) mz += 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) mz -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) mx += 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) mx -= 1;
    if (this.mouse) {
      if (this.mouse.x <= EDGE_PX) mx -= 1;
      if (this.mouse.x >= window.innerWidth - EDGE_PX) mx += 1;
      if (this.mouse.y <= EDGE_PX) mz += 1;
      if (this.mouse.y >= window.innerHeight - EDGE_PX) mz -= 1;
    }
    mx = Math.max(-1, Math.min(1, mx));
    mz = Math.max(-1, Math.min(1, mz));
    const dx = (this.forward.x * mz + rightX * mx) * speed;
    const dz = (this.forward.z * mz + rightZ * mx) * speed;

    let rot = 0;
    if (this.keys.has('KeyQ')) rot += 1.5 * dt;
    if (this.keys.has('KeyE')) rot -= 1.5 * dt;
    if (rot !== 0) {
      this.offset.subVectors(this.camera.position, target).applyAxisAngle(THREE.Object3D.DEFAULT_UP, rot);
      this.camera.position.copy(target).add(this.offset);
    }

    // Mantener el objetivo dentro de los límites del mapa.
    const nx = THREE.MathUtils.clamp(target.x + dx, this.bounds.minX, this.bounds.maxX);
    const nz = THREE.MathUtils.clamp(target.z + dz, this.bounds.minZ, this.bounds.maxZ);
    this.camera.position.x += nx - target.x;
    this.camera.position.z += nz - target.z;
    target.set(nx, 0, nz);
    this.controls.update(dt);
  }

  dispose(): void {
    this.controls.dispose();
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    window.removeEventListener('pointermove', this.onMouseMove);
    document.removeEventListener('mouseout', this.onMouseOut);
  }
}
