import * as THREE from 'three';
import { GameLoop } from './core/GameLoop';
import { Random } from './core/Random';
import type { Screen } from './core/Screen';
import { DICTATOR } from './data/country';
import { DIPLOMACY, type DiplomacyAction, type DiplomacyId } from './data/diplomacy';
import { RIOTS, type RiotDef } from './data/riots';
import { UNIT_ORDER, type UnitType } from './data/units';
import { NewsFeed, riotAftermath } from './news/NewsFeed';
import { CountryScreen } from './screens/CountryScreen';
import { RiotScreen } from './screens/RiotScreen';
import {
  applyEventOption,
  applyRiotResult,
  checkStatus,
  createRegime,
  devUnlock,
  endDay,
  veteranLevels,
  releasePrisoners,
  rollEvent,
  setPayLevel,
  useDiplomacy,
  type RegimeState,
  type RiotInstance,
} from './sim/regime';
import { PLANNING_TIME, RiotSim } from './sim/riot/RiotSim';
import type { RiotResult } from './sim/riot/types';
import { Hud } from './ui/Hud';
import { NewsTicker } from './ui/NewsTicker';
import { h } from './ui/dom';
import {
  fillNames,
  showModal,
  showDayReport,
  showEvent,
  showGameOver,
  showReleasePrisoners,
  showRiotLost,
  showSetup,
  type RiotSummary,
} from './ui/modals';

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
  /** MODO DEVELOPER (temporal): todas las tropas desbloqueadas. */
  private devMode = false;

  constructor(root: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    root.append(this.renderer.domElement);

    this.uiRoot = h('div', { class: 'ui-root' });
    root.append(this.uiRoot);
    this.hud = new Hud(this.uiRoot, {
      onDevToggle: () => this.toggleDev(),
      onPrisoners: () => this.openRelease(),
    });
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
    showSetup(this.uiRoot, this.regime, (names, tutorial) => {
      this.regime.rulerName = names.rulerName;
      this.regime.cityName = names.cityName;
      this.news.refresh(this.regime);
      if (tutorial) {
        this.startTutorial();
        return;
      }
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

  /** Activa/desactiva el modo developer: tropas y dinero de sobra en el despacho y en la revuelta. */
  private toggleDev(): void {
    this.devMode = !this.devMode;
    if (this.devMode) {
      devUnlock(this.regime);
      this.showCountry();
    }
    this.hud.update(this.regime, this.devMode);
  }

  private refreshCountry(): void {
    this.hud.update(this.regime, this.devMode);
    this.news.refresh(this.regime);
    this.showCountry();
    if (this.regime.status !== 'playing') this.gameOver();
  }

  private runDiplomacy(id: DiplomacyId): void {
    const action = DIPLOMACY.find((a) => a.id === id);
    if (!action || !useDiplomacy(this.regime, id)) return;
    this.announceDiplomacy(action);
    this.refreshCountry();
  }

  private announceDiplomacy(action: DiplomacyAction): void {
    this.news.pushBreaking({ text: `Diplomacia: ${action.name.toLowerCase()}. ${action.description}`, source: 'internacional' }, action.id, 1);
  }

  private openRelease(): void {
    showReleasePrisoners(this.uiRoot, this.regime, (count, mode) => {
      const deltas = releasePrisoners(this.regime, count, mode);
      if (deltas) {
        this.news.pushBreaking({
          text:
            mode === 'canje'
              ? `Pomposia canjea ${count} presos políticos por ayuda económica en una operación discreta.`
              : `Liberados ${count} presos políticos: escenas de emoción a las puertas de la cárcel de ${this.regime.cityName}.`,
          source: 'internacional',
        });
        this.news.pushBreaking({ text: `El ${DICTATOR.title} demuestra una vez más su infinita bondad.`, source: 'oficial' });
        this.refreshCountry();
      }
      return deltas;
    });
  }

  private showCountry(): void {
    this.loop.paused = false;
    this.loop.speed = 1;
    this.hud.setVisible(true);
    this.hud.update(this.regime, this.devMode);
    this.ticker.setMode('menu');
    this.setScreen(
      new CountryScreen({
        renderer: this.renderer,
        uiRoot: this.uiRoot,
        regime: this.regime,
        onRegimeChanged: () => this.hud.update(this.regime, this.devMode),
        onEmergency: () => {
          this.hud.update(this.regime, this.devMode);
          this.news.refresh(this.regime);
          this.news.pushBreaking({ text: `ÚLTIMA HORA: el gobierno decreta el Estado de Excepción en ${this.regime.cityName}.`, source: 'internacional' });
          this.news.pushBreaking({ text: '«Es solo para que todos estemos más tranquilos», asegura el Ministro de la Verdad.', source: 'oficial' });
        },
        onDiplomacy: (action) => {
          this.announceDiplomacy(action);
          this.hud.update(this.regime, this.devMode);
          this.news.refresh(this.regime);
          if (this.regime.status !== 'playing') this.gameOver();
        },
        onQuickDiplomacy: (id) => this.runDiplomacy(id),
        onRelease: () => this.openRelease(),
        onPayRaise: () => {
          setPayLevel(this.regime, 2);
          this.news.pushBreaking({ text: 'Subida de sueldo a las tropas: «Por su abnegada labor», dice el gobierno.', source: 'oficial' });
          this.refreshCountry();
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
      planning: PLANNING_TIME,
      // Clima aleatorio: a veces es de noche, a veces llueve (o las dos cosas).
      weather: { night: this.rng.chance(0.25), rain: this.rng.chance(0.25) },
      veterans: veteranLevels(this.regime),
      martyrs: this.regime.martyrs,
    });
    if (this.devMode) sim.devUnlockAll();
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
        devMode: this.devMode,
        onDevToggle: () => {
          this.devMode = !this.devMode;
          if (this.devMode) devUnlock(this.regime);
          return this.devMode;
        },
        onFinished: (result) => this.onRiotFinished(riot, result),
      }),
    );
  }

  /**
   * Tutorial: una manifestación pacífica y pequeña, con tropas prestadas y preparación sin límite.
   * No cuenta para la partida: ni gasta el día ni cambia el régimen.
   */
  private startTutorial(): void {
    const def: RiotDef = {
      ...RIOTS.cacerolazo,
      name: 'Manifestación de práctica',
      region: 'Tutorial',
      protesters: 40,
      radicalShare: 0,
      leaders: 1,
      aggression: 0,
      duration: 75,
      spawns: ['sur'],
      intlSensitivity: 0,
    };
    const stock = Object.fromEntries(UNIT_ORDER.map((t) => [t, 0])) as Record<UnitType, number>;
    Object.assign(stock, { soldier: 10, shield: 2, barricade: 4, negotiator: 1 });
    const sim = new RiotSim({ def, scale: 1, stock, loyalty: 90, unrest: 0, seed: this.rng.int(1, 1e9), planning: Infinity, demands: false, objectives: false });
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
        devMode: false,
        tutorial: true,
        onDevToggle: () => false,
        onFinished: (result) => {
          this.showCountry();
          showModal(
            this.uiRoot,
            result.won ? '¡Tutorial completado!' : 'Casi lo consigues',
            [
              h('p', {
                text: result.won
                  ? 'Ya sabes mover la cámara, colocar y mover tropas y poner barricadas. Ahora te toca gobernar de verdad: elige qué revuelta sofocar en el despacho.'
                  : 'La multitud llegó al palacio. Prueba a cortarles el paso con barricadas y una hilera de antidisturbios.',
              }),
            ],
            result.won
              ? [{ label: 'Al despacho', primary: true }]
              : [
                  { label: 'Ir al despacho' },
                  { label: 'Repetir el tutorial', primary: true, onClick: () => this.startTutorial() },
                ],
            result.won ? 'win' : 'lose',
          );
        },
      }),
    );
  }

  private onRiotFinished(riot: RiotInstance, result: RiotResult): void {
    const def = RIOTS[riot.defId];
    if (!result.won) {
      // Perder la protesta no cuesta el día: reintentar es gratis. El día solo avanza si el jugador lo fuerza.
      this.showCountry();
      showRiotLost(this.uiRoot, def, result, {
        onRetry: () => this.startRiot(riot),
        onBack: () => undefined,
      });
      return;
    }
    const deltas = applyRiotResult(this.regime, result, def);
    for (const item of riotAftermath(result, def, this.regime.cityName)) this.news.pushBreaking(item);
    if (result.arrests > 0) {
      this.news.pushBreaking({ text: `${result.arrests} detenidos durante «${def.name}». Ya son ${this.regime.prisoners} los presos políticos.`, source: 'internacional' });
    }
    this.finishDay(riot, { def, result, deltas });
  }

  private finishDay(riot: RiotInstance | null, summary: RiotSummary | null): void {
    const report = endDay(this.regime, riot?.uid ?? null, this.rng);
    if (this.devMode) devUnlock(this.regime);
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
        this.refreshCountry();
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
