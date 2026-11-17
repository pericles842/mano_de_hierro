import { CROWD_STAGES } from '../data/crowdStages';
import { FORCE_LEVELS } from '../data/forceLevels';
import { UNITS, UNIT_ORDER, type UnitType } from '../data/units';
import type { RiotSim } from '../sim/riot/RiotSim';
import type { Unit } from '../sim/riot/types';
import { h } from './dom';

export interface RiotHudHandlers {
  onCardPress(type: UnitType): void;
  onForce(level: number): void;
  onSpeed(speed: number): void;
  onPause(): void;
  onMute(): void;
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
  private readonly counts: HTMLElement;
  private readonly selected: HTMLElement;
  private readonly banner: HTMLElement;
  private readonly toasts: HTMLElement;
  private readonly cards = new Map<UnitType, { el: HTMLElement; count: HTMLElement }>();
  private readonly forceButtons: HTMLButtonElement[];
  private readonly speedButtons: { el: HTMLButtonElement; speed: number }[];
  private readonly pauseButton: HTMLButtonElement;
  private readonly muteButton: HTMLButtonElement;

  constructor(parent: HTMLElement, sim: RiotSim, cityName: string, handlers: RiotHudHandlers) {
    this.timerFill = h('div', { class: 'bar-fill neutral' });
    this.palaceFill = h('div', { class: 'bar-fill good' });
    this.timerLabel = h('span');
    this.palaceLabel = h('span');
    this.moodBadge = h('span', { class: 'mood-badge' });
    this.moodFill = h('div', { class: 'bar-fill' });
    this.phase = h('div', { class: 'riot-phase' });
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
      this.counts,
      sim.troopsReluctant ? h('div', { class: 'warning', text: '⚠ Lealtad baja: tus tropas dispersan con desgana.' }) : null,
    ]);

    this.forceButtons = FORCE_LEVELS.map((f) =>
      h('button', { class: `force-btn lvl${f.level}`, title: f.description, onClick: () => handlers.onForce(f.level) }, [
        h('span', { class: 'force-icon', text: f.icon }),
        h('span', { text: `${f.level + 1}. ${f.name}` }),
      ]),
    );
    const force = h('div', { class: 'force-panel panel' }, [
      h('div', { class: 'panel-title small', text: 'Nivel de fuerza' }),
      ...this.forceButtons,
      h('div', { class: 'hint', text: 'Más fuerza dispersa más rápido, pero enfurece a la gente: la protesta escala y se arma.' }),
    ]);

    this.pauseButton = h('button', { class: 'chip', text: '⏸', title: 'Pausa (Espacio)', onClick: () => handlers.onPause() });
    this.speedButtons = [1, 2, 4].map((speed) => ({
      speed,
      el: h('button', { class: 'chip', text: `x${speed}`, onClick: () => handlers.onSpeed(speed) }),
    }));
    this.muteButton = h('button', { class: 'chip', title: 'Sonido (M)', onClick: () => handlers.onMute() });
    const speed = h('div', { class: 'speed-panel panel' }, [
      this.pauseButton,
      ...this.speedButtons.map((s) => s.el),
      this.muteButton,
    ]);

    const unitBar = h('div', { class: 'unit-bar' });
    for (const type of UNIT_ORDER) {
      const def = UNITS[type];
      const count = h('span', { class: 'unit-count' });
      const el = h('div', { class: 'unit-card', title: def.description }, [
        h('div', { class: 'unit-icon', text: def.icon }),
        h('div', { class: 'unit-name', text: def.name }),
        count,
      ]);
      el.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        handlers.onCardPress(type);
      });
      this.cards.set(type, { el, count });
      unitBar.append(el);
    }

    const help = h('div', { class: 'riot-help' }, [
      h('div', { text: 'Colocar: clic en una tropa y clic en el mapa · Shift: hilera · Shift + rueda: cuántas.' }),
      h('div', { text: 'Seleccionar: arrastra un recuadro · Shift: añadir · Doble clic: todas las de ese tipo.' }),
      h('div', { text: 'Clic derecho: mover en formación (o cancelar la colocación).' }),
      h('div', { text: 'Cámara: WASD, bordes o botón central · Q/E: rotar · Rueda: zoom · 1-4: fuerza · M: sonido' }),
    ]);

    this.root = h('div', { class: 'riot-hud' }, [top, force, speed, unitBar, this.selected, help, this.toasts, this.banner]);
    parent.append(this.root);
  }

  setArmed(type: UnitType | null): void {
    for (const [t, card] of this.cards) card.el.classList.toggle('armed', t === type);
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
    this.phase.textContent = !sim.marchStarted
      ? `⏳ Concentración: la marcha arranca en ${Math.ceil(sim.marchStartsIn)} s. ¡Coloca tus barricadas!`
      : sim.chanting
        ? '📣 Se detienen a cantar consignas...'
        : `${stage.icon} ${stage.description}`;
    this.phase.style.color = stage.color;
    this.counts.textContent = `Protestando: ${sim.activeCount} · Dispersados: ${sim.dispersed} · Por llegar: ${sim.total - sim.spawned}`;

    for (const [type, card] of this.cards) {
      const n = sim.available[type];
      card.count.textContent = `×${n}`;
      card.el.classList.toggle('empty', n <= 0);
    }
    this.forceButtons.forEach((b, i) => b.classList.toggle('active', i === sim.forceLevel));
    this.pauseButton.classList.toggle('active', speed.paused);
    this.speedButtons.forEach((s) => s.el.classList.toggle('active', !speed.paused && s.speed === speed.speed));
    this.muteButton.textContent = muted ? '🔇' : '🔊';

    this.selected.style.display = selected.length > 0 ? '' : 'none';
    if (selected.length === 1) {
      const unit = selected[0];
      const def = UNITS[unit.type];
      const parts = [`${def.icon} ${def.name}`, `Integridad ${Math.ceil((unit.integrity / unit.maxIntegrity) * 100)}%`];
      if (def.water) parts.push(`Agua ${Math.ceil(unit.water)} s`);
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
