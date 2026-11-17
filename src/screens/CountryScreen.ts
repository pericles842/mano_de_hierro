import type * as THREE from 'three';
import type { Screen } from '../core/Screen';
import { CROWD_STAGES, stageForAnger } from '../data/crowdStages';
import { RIOTS } from '../data/riots';
import { initialAnger } from '../sim/riot/RiotSim';
import { CountryView } from '../render/CountryView';
import type { RegimeState, RiotInstance } from '../sim/regime';
import { CountryPanel } from '../ui/CountryPanel';
import { h } from '../ui/dom';

export interface CountryScreenOptions {
  renderer: THREE.WebGLRenderer;
  uiRoot: HTMLElement;
  regime: RegimeState;
  onRegimeChanged(): void;
  onSuppress(riot: RiotInstance): void;
  onSkipDay(): void;
}

/** Mapa de Pomposia: elige qué revuelta sofocar y gestiona el régimen. */
export class CountryScreen implements Screen {
  private readonly view: CountryView;
  private readonly panel: CountryPanel;
  private readonly labelLayer: HTMLElement;
  private readonly labels = new Map<number, HTMLElement>();
  private readonly briefing: HTMLElement;
  private width = 1;
  private height = 1;

  constructor(private readonly o: CountryScreenOptions) {
    this.view = new CountryView(o.renderer.domElement, o.regime.activeRiots);
    this.panel = new CountryPanel(o.uiRoot, o.regime, {
      onChange: o.onRegimeChanged,
      onSelectRiot: (uid) => this.select(uid),
      onSkipDay: o.onSkipDay,
    });

    this.labelLayer = h('div', { class: 'label-layer' });
    for (const riot of o.regime.activeRiots) {
      const label = h('button', { class: 'map-label', onClick: () => this.select(riot.uid) }, [
        h('span', { text: '🔥 ' }),
        RIOTS[riot.defId].name,
      ]);
      this.labels.set(riot.uid, label);
      this.labelLayer.append(label);
    }
    this.briefing = h('div', { class: 'briefing panel', style: 'display:none' });
    o.uiRoot.append(this.labelLayer, this.briefing);
  }

  private select(uid: number | null): void {
    this.panel.select(uid);
    const riot = this.o.regime.activeRiots.find((r) => r.uid === uid);
    if (!riot) {
      this.briefing.style.display = 'none';
      return;
    }
    const def = RIOTS[riot.defId];
    const anger = initialAnger(def, this.o.regime.unrest);
    const mood = CROWD_STAGES[stageForAnger(anger)];
    const stats = [
      `👥 ~${Math.round(def.protesters * riot.scale)} manifestantes`,
      `${mood.icon} Llegan en fase ${mood.name} (ira ${Math.round(anger * 100)}%)`,
      `🧱 Radicales ${Math.round(def.radicalShare * 100)}%`,
      `⏱ Aguantar ${def.duration} s`,
    ];
    this.briefing.replaceChildren(
      h('div', { class: 'briefing-region', text: def.region }),
      h('div', { class: 'modal-title', text: def.name }),
      h('p', { text: def.description }),
      h('div', { class: 'briefing-stats' }, stats.map((s) => h('span', { text: s }))),
      h('div', { class: 'modal-actions' }, [
        h('button', { class: 'btn ghost', text: 'Cerrar', onClick: () => this.select(null) }),
        h('button', { class: 'btn primary', text: '🪖 Enviar a las tropas', onClick: () => this.o.onSuppress(riot) }),
      ]),
    );
    this.briefing.style.display = '';
  }

  render(_alpha: number, frameDt: number): void {
    this.view.update(frameDt);
    this.view.render(this.o.renderer);
    for (const pos of this.view.markerScreenPositions(this.width, this.height)) {
      const label = this.labels.get(pos.uid);
      if (!label) continue;
      label.style.display = pos.visible ? '' : 'none';
      label.style.transform = `translate(${pos.x}px, ${pos.y}px) translate(-50%, -100%)`;
    }
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.view.setSize(width, height);
  }

  dispose(): void {
    this.view.dispose();
    this.panel.dispose();
    this.labelLayer.remove();
    this.briefing.remove();
  }
}
