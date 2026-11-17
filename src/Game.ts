import * as THREE from 'three';
import { GameLoop } from './core/GameLoop';
import { Random } from './core/Random';
import type { Screen } from './core/Screen';
import { DICTATOR } from './data/country';
import { RIOTS } from './data/riots';
import { NewsFeed, riotAftermath } from './news/NewsFeed';
import { CountryScreen } from './screens/CountryScreen';
import { RiotScreen } from './screens/RiotScreen';
import {
  applyEventOption,
  applyRiotResult,
  checkStatus,
  createRegime,
  endDay,
  rollEvent,
  type RegimeState,
  type RiotInstance,
} from './sim/regime';
import { RiotSim } from './sim/riot/RiotSim';
import type { RiotResult } from './sim/riot/types';
import { Hud } from './ui/Hud';
import { NewsTicker } from './ui/NewsTicker';
import { h } from './ui/dom';
import { fillNames, showDayReport, showEvent, showGameOver, showSetup, type RiotSummary } from './ui/modals';

/** Orquesta el juego: estado del régimen, noticiero, cambio de pantallas y bucle principal. */
export class Game {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly loop: GameLoop;
  private readonly rng = new Random();
  private readonly uiRoot: HTMLElement;
  private readonly hud: Hud;
  private readonly regime: RegimeState;
  private readonly news: NewsFeed;
  private readonly ticker: NewsTicker;
  private screen: Screen | null = null;

  constructor(root: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    root.append(this.renderer.domElement);

    this.uiRoot = h('div', { class: 'ui-root' });
    root.append(this.uiRoot);
    this.hud = new Hud(this.uiRoot);
    this.regime = createRegime(this.rng);
    this.news = new NewsFeed(this.rng);
    this.news.refresh(this.regime);
    this.ticker = new NewsTicker(this.uiRoot, this.news);

    this.loop = new GameLoop(
      (dt) => this.screen?.step?.(dt),
      (alpha, frameDt) => this.screen?.render(alpha, frameDt),
    );
    window.addEventListener('resize', this.onResize);
  }

  start(): void {
    this.loop.start();
    this.showCountry();
    showSetup(this.uiRoot, this.regime, (names) => {
      this.regime.rulerName = names.rulerName;
      this.regime.cityName = names.cityName;
      this.news.refresh(this.regime);
      this.news.pushBreaking({
        text: `${DICTATOR.title} ${names.rulerName} asume el poder (otra vez) en un emotivo acto en ${names.cityName}.`,
        source: 'oficial',
      });
      this.showCountry();
    });
  }

  private setScreen(screen: Screen): void {
    this.screen?.dispose();
    this.screen = screen;
    screen.resize(window.innerWidth, window.innerHeight);
  }

  private showCountry(): void {
    this.loop.paused = false;
    this.loop.speed = 1;
    this.hud.setVisible(true);
    this.hud.update(this.regime);
    this.ticker.setMode('menu');
    this.setScreen(
      new CountryScreen({
        renderer: this.renderer,
        uiRoot: this.uiRoot,
        regime: this.regime,
        onRegimeChanged: () => this.hud.update(this.regime),
        onEmergency: () => {
          this.hud.update(this.regime);
          this.news.refresh(this.regime);
          this.news.pushBreaking({ text: `ÚLTIMA HORA: el gobierno decreta el Estado de Excepción en ${this.regime.cityName}.`, source: 'internacional' });
          this.news.pushBreaking({ text: '«Es solo para que todos estemos más tranquilos», asegura el Ministro de la Verdad.', source: 'oficial' });
        },
        onDiplomacy: (action) => {
          this.hud.update(this.regime);
          this.news.pushBreaking({ text: `Diplomacia: ${action.name.toLowerCase()}. ${action.description}`, source: 'internacional' }, action.id, 1);
          this.news.refresh(this.regime);
          if (this.regime.status !== 'playing') this.gameOver();
        },
        onSuppress: (riot) => this.startRiot(riot),
        onSkipDay: () => this.finishDay(null, null),
      }),
    );
  }

  private startRiot(riot: RiotInstance): void {
    const sim = new RiotSim({
      def: RIOTS[riot.defId],
      scale: riot.scale,
      stock: this.regime.stock,
      loyalty: this.regime.loyalty,
      unrest: this.regime.unrest,
      upgrades: this.regime.upgrades,
      seed: this.rng.int(1, 1e9),
    });
    this.hud.setVisible(false);
    this.ticker.setMode('riot');
    this.setScreen(
      new RiotScreen({
        renderer: this.renderer,
        uiRoot: this.uiRoot,
        sim,
        loop: this.loop,
        cityName: this.regime.cityName,
        news: this.news,
        onFinished: (result) => this.onRiotFinished(riot, result),
      }),
    );
  }

  private onRiotFinished(riot: RiotInstance, result: RiotResult): void {
    const def = RIOTS[riot.defId];
    const deltas = applyRiotResult(this.regime, result, def);
    for (const item of riotAftermath(result, def, this.regime.cityName)) this.news.pushBreaking(item);
    this.finishDay(riot, { def, result, deltas });
  }

  private finishDay(riot: RiotInstance | null, summary: RiotSummary | null): void {
    const report = endDay(this.regime, riot?.uid ?? null, this.rng);
    this.news.refresh(this.regime);
    this.showCountry();
    showDayReport(this.uiRoot, this.regime, summary, report, () => {
      if (this.regime.status !== 'playing') {
        this.gameOver();
        return;
      }
      const event = rollEvent(this.regime, this.rng);
      if (!event) return;
      showEvent(this.uiRoot, this.regime, event, (option) => {
        const deltas = applyEventOption(this.regime, option);
        checkStatus(this.regime);
        this.news.pushBreaking({ text: `${event.title}: ${fillNames(option.outcome, this.regime)}`, source: 'internacional' });
        this.news.refresh(this.regime);
        this.showCountry();
        if (this.regime.status !== 'playing') this.gameOver();
        return deltas;
      });
    });
  }

  private gameOver(): void {
    const headlines = {
      coup: { text: `GOLPE DE ESTADO en ${this.regime.cityName}: los militares toman la TV estatal.`, source: 'internacional' as const },
      revolution: { text: `La revolución triunfa: ${this.regime.rulerName} huye del país en helicóptero.`, source: 'internacional' as const },
      victory: { text: `El ${DICTATOR.title} celebra ${this.regime.maxDays} días más en el poder con un desfile de 9 horas.`, source: 'oficial' as const },
    };
    if (this.regime.status !== 'playing') this.news.pushBreaking(headlines[this.regime.status]);
    showGameOver(this.uiRoot, this.regime, () => window.location.reload());
  }

  private readonly onResize = (): void => {
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.screen?.resize(window.innerWidth, window.innerHeight);
  };
}
