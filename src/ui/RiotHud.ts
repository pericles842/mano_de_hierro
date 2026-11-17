import { CROWD_STAGES } from '../data/crowdStages';
import { FORCE_LEVELS, type ForceLevel } from '../data/forceLevels';
import { GADGETS, GADGET_ORDER, type GadgetDef, type GadgetId } from '../data/gadgets';
import { CATEGORY_NAMES, UNITS, VISIBLE_UNITS, isVehicle, type UnitCategory, type UnitType } from '../data/units';
import type { RiotSim } from '../sim/riot/RiotSim';
import type { Unit } from '../sim/riot/types';
import { h } from './dom';
import { icon, setIcon } from './icons';

/** Consecuencias de cada nivel de fuerza, para la ficha. */
const FORCE_CONSEQUENCES: readonly string[] = [
  'Lo ideal en protestas pacíficas: la multitud se va calmando sola.',
  'Desbloquea gas, agua y golpes. Sube la ira poco a poco y la prensa lo comenta.',
  'Desbloquea perdigones y palizas: hay heridos, la protesta escala rápido y sube la molestia social.',
  'Habrá muertos: presión internacional, deserciones y riesgo de golpe de Estado.',
];

function forceStats(f: ForceLevel): { label: string; value: number }[] {
  const max = FORCE_LEVELS[FORCE_LEVELS.length - 1];
  return [
    { label: 'Dispersa', value: f.dispersalMult / max.dispersalMult },
    { label: 'Enfurece', value: f.angerPerSec / max.angerPerSec },
    { label: 'Empuje', value: f.knockback / max.knockback },
  ];
}

/** Rasgos de cada tropa en 0..1 para las barritas de la ficha. */
function unitStats(type: UnitType): { label: string; value: number; text?: string }[] {
  const d = UNITS[type];
  const reach = Math.max(d.range ?? 0, d.sprayRange ?? 0, d.pushRadius);
  return [
    { label: 'Velocidad', value: Math.min(1, d.speed / 9), text: d.speed === 0 ? 'Fija' : undefined },
    { label: 'Aguante', value: Math.max(0.08, Math.min(1, Math.log(d.integrity / 25) / Math.log(600 / 25))) },
    { label: 'Alcance', value: Math.min(1, reach / 17), text: reach === 0 ? '—' : undefined },
    { label: 'Provoca', value: Math.min(1, (d.provoke ?? 0) / 0.002), text: d.provoke ? undefined : 'Nada' },
  ];
}

export interface RiotHudHandlers {
  onCardPress(type: UnitType): void;
  onForce(level: number): void;
  onSpeed(speed: number): void;
  onPause(): void;
  onMute(): void;
  onDev(): void;
  /** El ratón pasó por un nivel de fuerza (el tutorial lo usa). */
  onForceHover?(level: number): void;
  /** Activar un gadget (pimienta, flash, inhibidor). */
  onGadget?(id: GadgetId): void;
  /** Terminar la preparación y que empiece la protesta. */
  onStartNow(): void;
}

export interface SpeedState {
  paused: boolean;
  speed: number;
}

/** Interfaz de la revuelta: tiempo, palacio, ánimo de la multitud, tropas y nivel de fuerza. */
export class RiotHud {
  private readonly root: HTMLElement;
  private readonly timerFill: HTMLElement;
  private readonly palaceFill: HTMLElement;
  private readonly palaceLabel: HTMLElement;
  private readonly timerLabel: HTMLElement;
  private readonly moodBadge: HTMLElement;
  private readonly moodFill: HTMLElement;
  private readonly phase: HTMLElement;
  /** Ficha de la tropa bajo el ratón (o elegida) en la barra de abajo. */
  private readonly unitInfo: HTMLElement;
  private hoverType: UnitType | null = null;
  private armedType: UnitType | null = null;
  private infoType: UnitType | null = null;
  private readonly planningBox: HTMLElement;
  private readonly planningLabel: HTMLElement;
  private readonly counts: HTMLElement;
  private readonly selected: HTMLElement;
  private readonly banner: HTMLElement;
  private readonly toasts: HTMLElement;
  private readonly cards = new Map<UnitType, { el: HTMLElement; count: HTMLElement }>();
  private readonly tabs: HTMLButtonElement[] = [];
  private readonly forceButtons: HTMLButtonElement[];
  private readonly gadgetButtons = new Map<GadgetId, { el: HTMLButtonElement; count: HTMLElement }>();
  private readonly speedButtons: { el: HTMLButtonElement; speed: number }[];
  private readonly pauseButton: HTMLButtonElement;
  private readonly muteButton: HTMLButtonElement;
  private readonly devButton: HTMLButtonElement;

  constructor(parent: HTMLElement, sim: RiotSim, cityName: string, handlers: RiotHudHandlers) {
    this.timerFill = h('div', { class: 'bar-fill neutral' });
    this.palaceFill = h('div', { class: 'bar-fill good' });
    this.timerLabel = h('span');
    this.palaceLabel = h('span');
    this.moodBadge = h('span', { class: 'mood-badge' });
    this.moodFill = h('div', { class: 'bar-fill' });
    this.phase = h('div', { class: 'riot-phase' });
    this.planningLabel = h('span');
    this.planningBox = h('div', { class: 'riot-planning' }, [
      this.planningLabel,
      h('button', { class: 'btn primary start-btn', onClick: () => handlers.onStartNow() }, [icon('play', 12), '¡Empezar ya!']),
    ]);
    this.counts = h('div', { class: 'riot-counts' });
    this.selected = h('div', { class: 'selected-info' });
    this.banner = h('div', { class: 'banner' });
    this.toasts = h('div', { class: 'toasts' });

    const top = h('div', { class: 'riot-top panel' }, [
      h('div', { class: 'riot-title', text: sim.def.name }),
      h('div', { class: 'riot-region', text: `${sim.def.region} · Plaza de la Patria, ${cityName}` }),
      h('div', { class: 'riot-bars' }, [
        h('div', {}, [h('div', { class: 'hud-label' }, ['Aguanta ', this.timerLabel]), h('div', { class: 'bar' }, [this.timerFill])]),
        h('div', {}, [h('div', { class: 'hud-label' }, ['Palacio ', this.palaceLabel]), h('div', { class: 'bar' }, [this.palaceFill])]),
        h('div', {}, [h('div', { class: 'hud-label' }, ['Ánimo ', this.moodBadge]), h('div', { class: 'bar' }, [this.moodFill])]),
      ]),
      this.phase,
      this.planningBox,
      this.counts,
      sim.troopsReluctant ? h('div', { class: 'warning', text: '⚠ Lealtad baja: tus tropas dispersan con desgana.' }) : null,
    ]);

    const forceInfo = h('div', { class: 'force-info', style: 'display:none' });
    this.forceButtons = FORCE_LEVELS.map((f) => {
      const b = h('button', { class: `force-btn lvl${f.level}`, onClick: () => handlers.onForce(f.level) }, [
        h('span', { class: 'force-icon', text: f.icon }),
        h('span', { text: `${f.level + 1}. ${f.name}` }),
      ]);
      b.addEventListener('pointerenter', () => {
        showForceInfo(forceInfo, f);
        handlers.onForceHover?.(f.level);
      });
      b.addEventListener('pointerleave', () => {
        forceInfo.style.display = 'none';
      });
      return b;
    });
    // Gadgets desbloqueados: un solo uso por protesta (más las cargas compradas).
    const owned = GADGET_ORDER.filter((g) => sim.gadgetUses[g] > 0);
    for (const g of owned) {
      const def = GADGETS[g];
      const count = h('span', { class: 'gadget-count' });
      const b = h('button', { class: 'gadget-btn', onClick: () => handlers.onGadget?.(g) }, [
        h('span', { class: 'force-icon', text: def.icon }),
        h('span', { class: 'gadget-name', text: `${def.key}. ${def.name}` }),
        count,
      ]);
      b.addEventListener('pointerenter', () => showGadgetInfo(forceInfo, def, sim.gadgetUses[g]));
      b.addEventListener('pointerleave', () => {
        forceInfo.style.display = 'none';
      });
      this.gadgetButtons.set(g, { el: b, count });
    }
    const force = h('div', { class: 'force-panel panel' }, [
      forceInfo,
      h('div', { class: 'panel-title small', text: 'Nivel de fuerza' }),
      ...this.forceButtons,
      h('div', { class: 'hint', text: 'Más fuerza dispersa más rápido, pero enfurece a la gente: la protesta escala y se arma.' }),
      owned.length > 0 ? h('div', { class: 'panel-title small gadget-title', text: 'Gadgets' }) : null,
      ...[...this.gadgetButtons.values()].map((g) => g.el),
    ]);

    this.pauseButton = h('button', { class: 'chip icon-chip', title: 'Pausa (Espacio)', onClick: () => handlers.onPause() }, [icon('pause', 14)]);
    this.speedButtons = [1, 2, 4].map((speed) => ({
      speed,
      el: h('button', { class: 'chip', text: `x${speed}`, onClick: () => handlers.onSpeed(speed) }),
    }));
    this.muteButton = h('button', { class: 'chip icon-chip', title: 'Sonido (M)', onClick: () => handlers.onMute() });
    this.devButton = h('button', { class: 'chip dev-btn', title: 'Modo developer: todas las tropas (temporal)', onClick: () => handlers.onDev() }, [icon('wrench', 13), 'DEV']);
    const speed = h('div', { class: 'speed-panel panel' }, [
      this.pauseButton,
      ...this.speedButtons.map((s) => s.el),
      this.muteButton,
      this.devButton,
    ]);

    // Barra de tropas por pestañas: Policía · Vehículos y defensas · Ejército.
    const cardRow = h('div', { class: 'unit-cards' });
    const tabRow = h('div', { class: 'unit-tabs' });
    const categories = Object.keys(CATEGORY_NAMES) as UnitCategory[];
    for (const cat of categories) {
      const tab = h('button', { class: 'unit-tab', text: CATEGORY_NAMES[cat], onClick: () => this.setTab(cat) });
      tab.dataset.category = cat;
      this.tabs.push(tab);
      tabRow.append(tab);
    }
    for (const type of VISIBLE_UNITS) {
      const def = UNITS[type];
      const count = h('span', { class: 'unit-count' });
      const el = h('div', { class: 'unit-card' }, [
        h('div', { class: 'unit-icon', text: def.icon }),
        h('div', { class: 'unit-name', text: def.name }),
        count,
      ]);
      el.dataset.category = def.category;
      el.addEventListener('pointerenter', () => {
        this.hoverType = type;
        this.refreshUnitInfo(sim);
      });
      el.addEventListener('pointerleave', () => {
        if (this.hoverType === type) this.hoverType = null;
        this.refreshUnitInfo(sim);
      });
      el.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        handlers.onCardPress(type);
      });
      this.cards.set(type, { el, count });
      cardRow.append(el);
    }
    this.unitInfo = h('div', { class: 'unit-info', style: 'display:none' });
    const unitBar = h('div', { class: 'unit-bar' }, [this.unitInfo, tabRow, cardRow]);
    this.setTab('policia');

    const help = h('div', { class: 'riot-help' }, [
      h('div', { text: 'Colocar: clic en una tropa y clic en el mapa · Shift: hilera · Shift + rueda: cuántas · R: girar.' }),
      h('div', { text: 'Seleccionar: arrastra un recuadro · Shift: añadir · Doble clic: todas las de ese tipo.' }),
      h('div', {}, [sim.fencesUnlocked ? 'Barricada seleccionada: ' : 'Barricada seleccionada (solo en la preparación): ', icon('move', 11), ' moverla (R: girar) · ', icon('trash', 11), ' quitarla (Supr).']),
      h('div', { text: 'Clic derecho: mover en formación · sobre alguien con el equipo de captura: arrestarlo · F: salva del camión lanzagás · Ratón sobre un manifestante: ver su clase.' }),
      h('div', { text: 'Cámara: WASD, bordes o botón central · Q/E: rotar · Rueda: zoom · 1-4: fuerza · M: sonido' }),
    ]);

    this.root = h('div', { class: 'riot-hud' }, [top, force, speed, unitBar, this.selected, help, this.toasts, this.banner]);
    parent.append(this.root);
  }

  setDev(on: boolean): void {
    this.devButton.classList.toggle('active', on);
    setIcon(this.devButton, 'wrench', on ? 'DEV ON' : 'DEV', 13);
  }

  setTab(category: UnitCategory): void {
    for (const tab of this.tabs) tab.classList.toggle('active', tab.dataset.category === category);
    for (const card of this.cards.values()) card.el.style.display = card.el.dataset.category === category ? '' : 'none';
  }

  setArmed(type: UnitType | null): void {
    for (const [t, card] of this.cards) card.el.classList.toggle('armed', t === type);
    this.armedType = type;
    this.infoType = null; // fuerza a redibujar la ficha
  }

  /** Ficha compacta encima de la barra: qué hace la tropa, sus rasgos y cómo colocarla. */
  private refreshUnitInfo(sim: RiotSim): void {
    const type = this.hoverType ?? this.armedType;
    this.root?.classList.toggle('unit-info-open', type !== null);
    if (!type) {
      this.unitInfo.style.display = 'none';
      this.infoType = null;
      return;
    }
    this.unitInfo.style.display = '';
    if (type === this.infoType) return;
    this.infoType = type;
    const def = UNITS[type];
    const armed = type === this.armedType;
    const extra = type === 'army' ? ' Se consigue decretando Estado de Excepción en el despacho.' : '';
    const hint = sim.available[type] <= 0
      ? 'No te quedan: cómpralas en el despacho.'
      : isVehicle(type)
        ? sim.planning
          ? 'Vehículo: saldrá del palacio cuando empiece la protesta.'
          : 'Clic: sale por la puerta del palacio y va al centro. Luego dale órdenes con clic derecho.'
        : armed
        ? `Clic en ${type === 'sniper' ? 'la azotea del palacio' : 'la plaza'} para colocar · Shift: hilera · R: girar · Clic derecho: soltar`
        : 'Clic en la tarjeta para elegirla';
    this.unitInfo.replaceChildren(
      h('div', { class: 'unit-info-head' }, [
        h('span', { class: 'unit-info-icon', text: def.icon }),
        h('div', {}, [
          h('div', { class: 'unit-info-name', text: def.name }),
          h('div', { class: 'unit-info-tag', text: CATEGORY_NAMES[def.category] }),
        ]),
      ]),
      h('div', { class: 'unit-info-desc', text: def.description + extra }),
      h('div', { class: 'unit-info-stats' }, unitStats(type).map((s) =>
        h('div', { class: 'unit-stat' }, [
          h('span', { class: 'unit-stat-label', text: s.label }),
          s.text
            ? h('span', { class: 'unit-stat-text', text: s.text })
            : h('span', { class: 'unit-stat-bar' }, [h('span', { style: `width:${Math.round(s.value * 100)}%` })]),
        ]),
      )),
      h('div', { class: `unit-info-hint ${armed ? 'armed' : ''}`, text: hint }),
    );
  }

  update(sim: RiotSim, selected: readonly Unit[], speed: SpeedState, muted: boolean): void {
    const remaining = Math.max(0, sim.duration - sim.elapsed);
    this.timerLabel.textContent = `${Math.ceil(remaining)} s`;
    this.timerFill.style.width = `${(remaining / sim.duration) * 100}%`;
    this.palaceLabel.textContent = `${Math.ceil(sim.palaceHp)}%`;
    this.palaceFill.style.width = `${sim.palaceHp}%`;
    this.palaceFill.className = `bar-fill ${sim.palaceHp < 35 ? 'bad' : 'good'}`;

    const stage = CROWD_STAGES[sim.stage];
    this.moodBadge.textContent = `${stage.icon} ${stage.name}`;
    this.moodBadge.style.color = stage.color;
    this.moodFill.style.width = `${sim.anger * 100}%`;
    this.moodFill.style.background = stage.color;
    this.planningBox.style.display = sim.planning ? '' : 'none';
    // En el tutorial la preparación no tiene límite: sin cuenta atrás.
    if (sim.planning) this.planningLabel.textContent = Number.isFinite(sim.planningLeft) ? `${Math.ceil(sim.planningLeft)} s` : '';
    this.phase.textContent = sim.planning
      ? '🛠 Preparación: coloca tus tropas y barricadas. Cuando empiece, las barricadas quedan fijas y podrás sacar vehículos del palacio.'
      : sim.lethalForce
      ? '☠️ FUEGO REAL: hay muertos. Los derechos humanos están suspendidos.'
      : !sim.marchStarted
        ? `⏳ Concentración: la marcha arranca en ${Math.ceil(sim.marchStartsIn)} s.`
        : sim.crowdMode === 'rally'
          ? `📣 Protestan en la plaza. Pueden avalancharse en cualquier momento. ${stage.icon} ${stage.name}`
          : sim.chanting
            ? '📣 Se detienen a cantar consignas...'
            : `🏃 ¡Avanzan hacia el palacio! ${stage.icon} ${stage.description}`;
    this.phase.style.color = sim.lethalForce ? '#f87171' : stage.color;
    const casualties = sim.deaths + sim.injuredCount + sim.soldiersKilled > 0
      ? ` · 🩸 Muertos: ${sim.deaths} · Heridos: ${sim.injuredCount} · Agentes caídos: ${sim.soldiersKilled}`
      : '';
    this.counts.textContent = `Protestando: ${sim.activeCount} · 📣 Líderes: ${sim.leadersLeft} · Dispersados: ${sim.dispersed} · Detenidos: ${sim.arrests} · Por llegar: ${sim.total - sim.spawned}${casualties}`;
    for (const [g, b] of this.gadgetButtons) {
      const n = sim.gadgetUses[g];
      b.count.textContent = `×${n}`;
      b.el.disabled = n <= 0 || sim.planning;
    }

    for (const [type, card] of this.cards) {
      const n = sim.available[type];
      card.count.textContent = `×${n}`;
      card.el.classList.toggle('empty', n <= 0);
      card.el.classList.toggle('locked', n > 0 && isVehicle(type) && sim.planning);
    }
    this.forceButtons.forEach((b, i) => b.classList.toggle('active', i === sim.forceLevel));
    this.pauseButton.classList.toggle('active', speed.paused);
    this.speedButtons.forEach((s) => s.el.classList.toggle('active', !speed.paused && s.speed === speed.speed));
    if (this.muteButton.dataset.muted !== String(muted)) {
      this.muteButton.dataset.muted = String(muted);
      setIcon(this.muteButton, muted ? 'mute' : 'sound', '', 15);
    }
    this.refreshUnitInfo(sim);

    this.selected.style.display = selected.length > 0 ? '' : 'none';
    if (selected.length === 1) {
      const unit = selected[0];
      const def = UNITS[unit.type];
      const parts = [`${def.icon} ${def.name}`, `Integridad ${Math.ceil((unit.integrity / unit.maxIntegrity) * 100)}%`];
      if (def.infantry) parts.push(unit.retreating ? '⚠ Replegándose' : `Moral ${Math.round(unit.morale * 100)}%`);
      if (unit.refusing > 0) parts.push('⚠ Se niega a actuar');
      if (def.water) parts.push(`Agua ${Math.ceil(unit.water)} s`);
      if (unit.maxAmmo > 0) parts.push(`Munición ${Math.floor(unit.ammo)}/${unit.maxAmmo}`);
      parts.push(def.speed > 0 ? 'Clic derecho: mover' : 'Fija');
      this.selected.textContent = parts.join(' · ');
    } else if (selected.length > 1) {
      const byType = new Map<UnitType, number>();
      for (const u of selected) byType.set(u.type, (byType.get(u.type) ?? 0) + 1);
      const summary = [...byType].map(([type, n]) => `${n}× ${UNITS[type].icon}`).join('  ');
      this.selected.textContent = `${selected.length} seleccionadas: ${summary} · Clic derecho: mover en formación`;
    }
  }

  toast(text: string, tone: 'good' | 'bad' | 'neutral'): void {
    const el = h('div', { class: `toast ${tone}`, text });
    this.toasts.append(el);
    while (this.toasts.children.length > 4) this.toasts.firstElementChild?.remove();
    window.setTimeout(() => el.classList.add('fade'), 2600);
    window.setTimeout(() => el.remove(), 3200);
  }

  showBanner(text: string, kind: 'win' | 'lose'): void {
    this.banner.textContent = text;
    this.banner.className = `banner show ${kind}`;
  }

  dispose(): void {
    this.root.remove();
  }
}

/** Ficha compacta a la izquierda del panel de fuerza: qué hace el nivel y qué cuesta. */
function showForceInfo(el: HTMLElement, f: ForceLevel): void {
  el.style.display = '';
  el.className = `force-info lvl${f.level}`;
  el.replaceChildren(
    h('div', { class: 'unit-info-head' }, [
      h('span', { class: 'unit-info-icon', text: f.icon }),
      h('div', {}, [
        h('div', { class: 'unit-info-name', text: f.name }),
        h('div', { class: 'unit-info-tag' }, ['Tecla ', h('kbd', { text: String(f.level + 1) })]),
      ]),
    ]),
    h('div', { class: 'unit-info-desc', text: f.description }),
    h('div', { class: 'unit-info-stats' }, forceStats(f).map((s) =>
      h('div', { class: 'unit-stat' }, [
        h('span', { class: 'unit-stat-label', text: s.label }),
        h('span', { class: 'unit-stat-bar' }, [h('span', { style: `width:${Math.max(4, Math.round(s.value * 100))}%` })]),
      ]),
    )),
    h('div', { class: 'unit-info-hint', text: FORCE_CONSEQUENCES[f.level] }),
  );
}

/** Ficha del gadget bajo el ratón (misma posición que la del nivel de fuerza). */
function showGadgetInfo(el: HTMLElement, g: GadgetDef, uses: number): void {
  el.style.display = '';
  el.className = 'force-info gadget';
  el.replaceChildren(
    h('div', { class: 'unit-info-head' }, [
      h('span', { class: 'unit-info-icon', text: g.icon }),
      h('div', {}, [
        h('div', { class: 'unit-info-name', text: g.name }),
        h('div', { class: 'unit-info-tag' }, ['Tecla ', h('kbd', { text: g.key }), ` · ${uses} uso${uses === 1 ? '' : 's'}`]),
      ]),
    ]),
    h('div', { class: 'unit-info-desc', text: g.description }),
    h('div', { class: 'unit-info-hint', text: 'Un solo uso por protesta. Compra cargas extra en el despacho.' }),
  );
}
