import * as THREE from 'three';
import { audio } from '../audio/AudioEngine';
import type { GameLoop } from '../core/GameLoop';
import type { Screen } from '../core/Screen';
import { CROWD_STAGES } from '../data/crowdStages';
import type { SpawnId } from '../data/riots';
import { UNITS, type UnitType } from '../data/units';
import { RtsCamera } from '../input/RtsCamera';
import { riotHeadline, type NewsFeed } from '../news/NewsFeed';
import { RiotView, type GhostPlacement } from '../render/RiotView';
import type { RiotSim } from '../sim/riot/RiotSim';
import type { RiotResult, Unit } from '../sim/riot/types';
import { RiotHud } from '../ui/RiotHud';
import { h } from '../ui/dom';
import { showModal } from '../ui/modals';

export interface RiotScreenOptions {
  renderer: THREE.WebGLRenderer;
  uiRoot: HTMLElement;
  sim: RiotSim;
  loop: GameLoop;
  cityName: string;
  news: NewsFeed;
  devMode: boolean;
  /** Cambia el modo developer y devuelve si quedó activo. */
  onDevToggle(): boolean;
  onFinished(result: RiotResult): void;
}

const CLICK_TOLERANCE_PX = 6;
const MAX_ROW = 12;
const SPAWN_NAMES: Record<SpawnId, string> = { sur: 'la avenida sur', este: 'la calle este', oeste: 'la calle oeste' };

interface Point {
  x: number;
  y: number;
}

/** Revuelta en tiempo real: une simulación, vista, cámara, HUD y entrada del jugador. */
export class RiotScreen implements Screen {
  private readonly sim: RiotSim;
  private readonly view: RiotView;
  private readonly camera: RtsCamera;
  private readonly hud: RiotHud;
  private readonly canvas: HTMLCanvasElement;
  private readonly cursorTip: HTMLElement;
  private readonly selectBox: HTMLElement;
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  private readonly ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private readonly hit = new THREE.Vector3();
  private readonly forward = new THREE.Vector3();
  private readonly projected = new THREE.Vector3();

  private readonly selected = new Set<number>();
  /** Tropa "en la mano": se ve en transparente bajo el ratón hasta colocarla. */
  private placeType: UnitType | null = null;
  private rowCount = 5;
  private rowAngle = 0;
  private shiftHeld = false;
  private pressedOnCard = false;
  private mouse: Point | null = null;
  /** Inicio de un clic izquierdo sobre el mapa (clic o recuadro de selección). */
  private dragStart: Point | null = null;
  private boxActive = false;
  private finishTimer = -1;
  private done = false;
  private hudTimer = 0;

  constructor(private readonly o: RiotScreenOptions) {
    this.sim = o.sim;
    this.canvas = o.renderer.domElement;
    this.view = new RiotView(o.sim);
    this.camera = new RtsCamera(this.view.camera, this.canvas, { minX: -35, maxX: 35, minZ: -26, maxZ: 40 });
    this.hud = new RiotHud(o.uiRoot, o.sim, o.cityName, {
      onCardPress: (type) => this.pressCard(type),
      onForce: (level) => this.requestForce(level),
      onSpeed: (speed) => {
        o.loop.speed = speed;
        o.loop.paused = false;
      },
      onPause: () => {
        o.loop.paused = !o.loop.paused;
      },
      onMute: () => audio.toggleMute(),
      onDev: () => {
        const on = o.onDevToggle();
        if (on) {
          this.sim.devUnlockAll();
          this.hud.toast('🛠 Modo developer: todas las tropas desbloqueadas', 'neutral');
        }
        this.hud.setDev(on);
      },
    });
    this.hud.setDev(o.devMode);
    this.cursorTip = h('div', { class: 'cursor-tip', style: 'display:none' });
    this.selectBox = h('div', { class: 'select-box', style: 'display:none' });
    o.uiRoot.append(this.cursorTip, this.selectBox);

    this.canvas.addEventListener('pointerdown', this.onPointerDown);
    this.canvas.addEventListener('dblclick', this.onDoubleClick);
    this.canvas.addEventListener('contextmenu', this.onContextMenu);
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
    window.addEventListener('wheel', this.onWheel, { capture: true, passive: false });
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    audio.startCrowd();
  }

  step(dt: number): void {
    this.sim.step(dt);
    const events = this.sim.events;
    this.view.handleEvents(events);
    audio.handleRiotEvents(events);
    for (const e of events) {
      const headline = riotHeadline(e, this.sim.def, this.o.cityName);
      if (headline) this.o.news.pushBreaking(headline[0], headline[1], 15);
      if (e.type === 'retreat') {
        this.hud.toast(`${UNITS[e.unitType].icon} ${UNITS[e.unitType].name}: moral rota, se repliegan`, 'bad');
      } else if (e.type === 'refuse') {
        this.hud.toast('🪖 ¡Un pelotón se niega a actuar! (lealtad baja)', 'bad');
      } else if (e.type === 'desert') {
        this.hud.toast('🪖 ¡Soldados desertan y se unen a la multitud!', 'bad');
      } else if (e.type === 'press') {
        this.hud.toast('📸 La prensa lo grabó todo: sube la presión internacional', 'bad');
      } else if (e.type === 'surge') {
        this.hud.toast('🏃 ¡La multitud se avalancha hacia el palacio!', 'bad');
      } else if (e.type === 'regroup') {
        this.hud.toast('📣 La multitud se repliega y vuelve a protestar en la plaza', 'good');
      } else if (e.type === 'openFire') {
        this.hud.toast(e.by === 'army' ? '🪖 El ejército abre fuego real' : '☠️ La policía dispara a matar', 'bad');
      } else if (e.type === 'martyr') {
        this.hud.toast('🕯️ Han matado a un líder: la multitud enloquece', 'bad');
      } else if (e.type === 'soldierDown') {
        this.hud.toast(`🩸 ${UNITS[e.unitType].name}: agentes caídos`, 'bad');
      }
      if (e.type === 'escalate') {
        const s = CROWD_STAGES[e.stage];
        this.hud.toast(
          e.up ? `${s.icon} ¡La protesta se vuelve ${s.name.toLowerCase()}!` : `${s.icon} La multitud se calma: ${s.name}`,
          e.up ? 'bad' : 'good',
        );
      } else if (e.type === 'marchStart') {
        this.hud.toast('📢 ¡Arranca la marcha!', 'bad');
      } else if (e.type === 'wave') {
        this.hud.toast(`Nueva oleada desde ${SPAWN_NAMES[e.spawn]} (${e.count})`, 'neutral');
      }
    }
    if (this.sim.result && this.finishTimer < 0) {
      const won = this.sim.result.won;
      this.finishTimer = 2.5;
      this.disarm();
      audio.play(won ? 'win' : 'lose');
      this.hud.showBanner(won ? '¡Revuelta sofocada!' : 'El palacio quedó en sus manos', won ? 'win' : 'lose');
    }
  }

  render(alpha: number, frameDt: number): void {
    const loop = this.o.loop;
    const simDt = loop.paused ? 0 : frameDt * loop.speed;
    this.camera.update(frameDt);
    this.pruneSelection();
    this.updatePreview();
    this.view.render(this.o.renderer, alpha, simDt, this.selected);
    audio.updateCrowd(simDt, {
      active: this.sim.activeCount,
      anger: this.sim.anger,
      stage: this.sim.stage,
      chanting: this.sim.chanting,
      pots: this.sim.def.id === 'cacerolazo',
    });

    this.hudTimer -= frameDt;
    if (this.hudTimer <= 0) {
      this.hudTimer = 0.1;
      this.hud.update(this.sim, this.selectedUnits(), { paused: loop.paused, speed: loop.speed }, audio.muted);
    }

    if (this.finishTimer >= 0 && !this.done) {
      this.finishTimer -= frameDt;
      if (this.finishTimer <= 0 && this.sim.result) {
        this.done = true;
        this.o.onFinished(this.sim.result); // esto destruye la pantalla: no tocar nada después
      }
    }
  }

  resize(width: number, height: number): void {
    this.view.setSize(width, height);
  }

  // ─── Colocación de tropas ─────────────────────────────────────────────

  private pressCard(type: UnitType): void {
    if (this.sim.result) return;
    this.pressedOnCard = true;
    if (this.placeType === type) {
      this.disarm();
      return;
    }
    if (this.sim.available[type] <= 0) return;
    this.placeType = type;
    this.selected.clear();
    this.hud.setArmed(type);
    audio.play('click');
  }

  private disarm(): void {
    this.placeType = null;
    this.hud.setArmed(null);
    this.view.setGhosts(null);
    this.cursorTip.style.display = 'none';
  }

  /** Posiciones de la(s) tropa(s) a colocar bajo el ratón: una, o una hilera con Shift. */
  private placements(): { list: GhostPlacement[]; heading: number } | null {
    const type = this.placeType;
    if (!type || !this.mouse || !this.overCanvas(this.mouse)) return null;
    const p = this.groundPoint(this.mouse);
    if (!p) return null;

    // La hilera va a lo ancho de la pantalla y las tropas miran hacia la cámara (hacia la multitud).
    this.forward.subVectors(this.camera.controls.target, this.view.camera.position).setY(0).normalize();
    // Tecla R: gira la hilera de 45 en 45 grados.
    const c = Math.cos(this.rowAngle);
    const s = Math.sin(this.rowAngle);
    const fx = this.forward.x * c - this.forward.z * s;
    const fz = this.forward.x * s + this.forward.z * c;
    const rightX = -fz;
    const rightZ = fx;
    const heading = Math.atan2(-fx, -fz);
    const spacing = UNITS[type].rowSpacing;
    const n = this.shiftHeld ? Math.max(1, Math.min(this.rowCount, this.sim.available[type])) : 1;

    const list: GhostPlacement[] = [];
    for (let i = 0; i < n; i++) {
      const offset = (i - (n - 1) / 2) * spacing;
      const x = p.x + rightX * offset;
      const z = p.z + rightZ * offset;
      list.push({ x, z, valid: this.sim.canDeploy(type, x, z) });
    }
    return { list, heading };
  }

  private updatePreview(): void {
    if (!this.placeType) return;
    const placement = this.placements();
    this.view.setGhosts(this.placeType, placement?.list ?? [], placement?.heading ?? 0);
    if (!placement || !this.mouse) {
      this.cursorTip.style.display = 'none';
      return;
    }
    const def = UNITS[this.placeType];
    this.cursorTip.textContent = this.shiftHeld
      ? `${def.icon} Hilera ×${placement.list.length} · rueda: ±1 · R: girar`
      : `${def.icon} ${def.name} · Shift: hilera · R: girar`;
    this.cursorTip.style.display = '';
    this.cursorTip.style.transform = `translate(${this.mouse.x + 16}px, ${this.mouse.y + 18}px)`;
  }

  private placeAtCursor(): void {
    const type = this.placeType;
    const placement = this.placements();
    if (!type || !placement) return;
    let placed = 0;
    for (const p of placement.list) {
      if (p.valid && this.sim.deploy(type, p.x, p.z, placement.heading)) placed++;
    }
    if (placed === 0) {
      audio.play('cancel');
      return;
    }
    audio.play('place');
    if (this.sim.available[type] <= 0) this.disarm();
  }

  // ─── Selección y órdenes ──────────────────────────────────────────────

  private selectedUnits(): Unit[] {
    return this.sim.units.filter((u) => this.selected.has(u.id));
  }

  private pruneSelection(): void {
    if (this.selected.size === 0) return;
    const alive = new Set(this.sim.units.map((u) => u.id));
    for (const id of this.selected) if (!alive.has(id)) this.selected.delete(id);
  }

  private unitAt(screen: Point): Unit | null {
    const p = this.groundPoint(screen);
    if (!p) return null;
    let best: Unit | null = null;
    let bestD = 1.2;
    for (const u of this.sim.units) {
      const def = UNITS[u.type];
      const d = Math.hypot(u.x - p.x, u.z - p.z) - def.halfLength - def.radius;
      if (d < bestD) {
        bestD = d;
        best = u;
      }
    }
    return best;
  }

  private clickSelect(screen: Point, additive: boolean): void {
    const unit = this.unitAt(screen);
    if (!additive) this.selected.clear();
    if (!unit) return;
    if (additive && this.selected.has(unit.id)) this.selected.delete(unit.id);
    else this.selected.add(unit.id);
  }

  /** Selecciona las tropas cuyo centro cae dentro del recuadro dibujado en pantalla. */
  private boxSelect(a: Point, b: Point, additive: boolean): void {
    const minX = Math.min(a.x, b.x);
    const maxX = Math.max(a.x, b.x);
    const minY = Math.min(a.y, b.y);
    const maxY = Math.max(a.y, b.y);
    const rect = this.canvas.getBoundingClientRect();
    const inside = this.sim.units.filter((u) => {
      this.projected.set(u.x, 0.8, u.z).project(this.view.camera);
      const sx = rect.left + ((this.projected.x + 1) / 2) * rect.width;
      const sy = rect.top + ((1 - this.projected.y) / 2) * rect.height;
      return sx >= minX && sx <= maxX && sy >= minY && sy <= maxY;
    });
    // Si el recuadro incluye tropas móviles, ignora las barricadas (no se pueden mover).
    const movable = inside.filter((u) => UNITS[u.type].speed > 0);
    const pick = movable.length > 0 ? movable : inside;
    if (!additive) this.selected.clear();
    for (const u of pick) this.selected.add(u.id);
  }

  /**
   * Mano dura = fuego real. Antes de ordenarlo, una alerta obligatoria:
   * es una contramedida extrema con muertos y derechos humanos suspendidos.
   */
  private requestForce(level: number): void {
    if (level < 3 || this.sim.forceLevel === 3) {
      this.sim.setForce(level);
      return;
    }
    const loop = this.o.loop;
    const wasPaused = loop.paused;
    loop.paused = true;
    audio.play('alarm');
    showModal(
      this.o.uiRoot,
      '⚠️ Orden de fuego real',
      [
        h('p', {
          text: 'Vas a ordenar «Mano dura». Los antidisturbios dispararán munición letal (escopetas y, si tienes armamento pesado, fusiles AK). El ejército, si está en la calle, también disparará a matar.',
        }),
        h('p', {
          text: 'Habrá muertos y heridos. Los derechos humanos quedan suspendidos: la presión internacional, la molestia social y el riesgo de deserciones y golpe de Estado se dispararán. Cada muerte cerca de la prensa dará la vuelta al mundo.',
        }),
        h('p', { class: 'hint', text: 'Puedes volver a un nivel inferior en cualquier momento (teclas 1-3).' }),
      ],
      [
        {
          label: 'Cancelar',
          onClick: () => {
            loop.paused = wasPaused;
          },
        },
        {
          label: '☠️ Ordenar fuego real',
          primary: true,
          onClick: () => {
            this.sim.setForce(3);
            loop.paused = wasPaused;
            this.hud.toast('☠️ Fuego real autorizado', 'bad');
          },
        },
      ],
      'lose',
    );
  }

  /** Tecla F: los camiones lanzagás seleccionados disparan su próxima salva donde está el ratón. */
  private gasTruckAbility(): void {
    if (!this.mouse) return;
    const p = this.groundPoint(this.mouse);
    if (!p) return;
    let ordered = 0;
    for (const u of this.selectedUnits()) if (this.sim.orderAbility(u.id, p.x, p.z)) ordered++;
    if (ordered > 0) {
      this.view.showMoveMarker(p.x, p.z);
      this.hud.toast(`🚚 Salva de gas ordenada (${ordered})`, 'neutral');
    }
  }

  /** Mueve el grupo manteniendo la formación relativa alrededor del punto indicado. */
  private moveSelection(screen: Point): void {
    const p = this.groundPoint(screen);
    if (!p) return;
    // Clic derecho sobre un líder con equipos de captura seleccionados: arrestarlo.
    const captures = this.selectedUnits().filter((u) => u.type === 'capture');
    const leader = captures.length > 0 ? this.sim.leaderAt(p.x, p.z, 2) : null;
    if (leader) {
      for (const u of captures) this.sim.orderCapture(u.id, leader.id);
      this.hud.toast('🕶️ Equipo de captura: a por el líder', 'neutral');
      audio.play('click');
      return;
    }
    const units = this.selectedUnits().filter((u) => UNITS[u.type].speed > 0);
    if (units.length === 0) return;
    const cx = units.reduce((s, u) => s + u.x, 0) / units.length;
    const cz = units.reduce((s, u) => s + u.z, 0) / units.length;
    for (const u of units) this.sim.orderMove(u.id, p.x + (u.x - cx), p.z + (u.z - cz));
    this.view.showMoveMarker(p.x, p.z);
    audio.play('click');
  }

  // ─── Entrada ───────────────────────────────────────────────────────────

  private overCanvas(screen: Point): boolean {
    return document.elementFromPoint(screen.x, screen.y) === this.canvas;
  }

  private groundPoint(screen: Point): THREE.Vector3 | null {
    const rect = this.canvas.getBoundingClientRect();
    this.pointer.set(((screen.x - rect.left) / rect.width) * 2 - 1, -((screen.y - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.view.camera);
    return this.raycaster.ray.intersectPlane(this.ground, this.hit);
  }

  private readonly onPointerDown = (e: PointerEvent): void => {
    const at = { x: e.clientX, y: e.clientY };
    if (e.button === 0) {
      this.dragStart = at;
      this.boxActive = false;
    } else if (e.button === 2) {
      if (this.placeType) {
        this.disarm();
        audio.play('cancel');
      } else {
        this.moveSelection(at);
      }
    }
  };

  private readonly onPointerMove = (e: PointerEvent): void => {
    this.mouse = { x: e.clientX, y: e.clientY };
    this.shiftHeld = e.shiftKey;
    const start = this.dragStart;
    if (!start || this.placeType) return;
    if (!this.boxActive && Math.hypot(e.clientX - start.x, e.clientY - start.y) > CLICK_TOLERANCE_PX) this.boxActive = true;
    if (this.boxActive) {
      const s = this.selectBox.style;
      s.display = '';
      s.left = `${Math.min(start.x, e.clientX)}px`;
      s.top = `${Math.min(start.y, e.clientY)}px`;
      s.width = `${Math.abs(e.clientX - start.x)}px`;
      s.height = `${Math.abs(e.clientY - start.y)}px`;
    }
  };

  private readonly onPointerUp = (e: PointerEvent): void => {
    if (e.button !== 0) return;
    const at = { x: e.clientX, y: e.clientY };
    this.mouse = at;
    this.shiftHeld = e.shiftKey;

    // Arrastrar desde la carta y soltar en el mapa también coloca la tropa.
    if (this.pressedOnCard) {
      this.pressedOnCard = false;
      this.dragStart = null;
      if (this.placeType && this.overCanvas(at)) this.placeAtCursor();
      return;
    }

    const start = this.dragStart;
    this.dragStart = null;
    this.selectBox.style.display = 'none';
    if (!start) return;
    if (this.boxActive) {
      this.boxActive = false;
      this.boxSelect(start, at, e.shiftKey);
      return;
    }
    if (this.placeType) this.placeAtCursor();
    else this.clickSelect(at, e.shiftKey);
  };

  private readonly onDoubleClick = (e: MouseEvent): void => {
    if (this.placeType) return;
    const unit = this.unitAt({ x: e.clientX, y: e.clientY });
    if (!unit) return;
    this.selected.clear();
    for (const u of this.sim.units) if (u.type === unit.type) this.selected.add(u.id);
  };

  private readonly onWheel = (e: WheelEvent): void => {
    if (!this.placeType || !(e.shiftKey || this.shiftHeld)) return;
    e.preventDefault();
    e.stopPropagation(); // que la cámara no haga zoom
    const delta = e.deltaY !== 0 ? e.deltaY : e.deltaX; // con Shift, Windows convierte la rueda en horizontal
    const max = Math.min(MAX_ROW, Math.max(1, this.sim.available[this.placeType]));
    this.rowCount = Math.max(1, Math.min(max, this.rowCount + (delta < 0 ? 1 : -1)));
    audio.play('click');
  };

  private readonly onContextMenu = (e: Event): void => e.preventDefault();

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    if (e.key === 'Shift') this.shiftHeld = true;
    if (e.code === 'Space') {
      e.preventDefault();
      this.o.loop.paused = !this.o.loop.paused;
    } else if (e.code === 'Escape') {
      if (this.placeType) this.disarm();
      else this.selected.clear();
    } else if (e.code === 'KeyM') {
      audio.toggleMute();
    } else if (e.code === 'KeyR' && this.placeType) {
      this.rowAngle = (this.rowAngle + Math.PI / 4) % (Math.PI * 2);
      audio.play('click');
    } else if (/^Digit[1-4]$/.test(e.code)) {
      this.requestForce(Number(e.code.slice(5)) - 1);
    } else if (e.code === 'KeyF') {
      this.gasTruckAbility();
    }
  };

  private readonly onKeyUp = (e: KeyboardEvent): void => {
    if (e.key === 'Shift') this.shiftHeld = false;
  };

  dispose(): void {
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    this.canvas.removeEventListener('dblclick', this.onDoubleClick);
    this.canvas.removeEventListener('contextmenu', this.onContextMenu);
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
    window.removeEventListener('wheel', this.onWheel, { capture: true });
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    audio.stopCrowd();
    this.camera.dispose();
    this.view.dispose();
    this.hud.dispose();
    this.cursorTip.remove();
    this.selectBox.remove();
  }
}
