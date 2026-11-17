import type { RiotSim } from '../sim/riot/RiotSim';
import { h } from './dom';
import { icon } from './icons';

/** Lo que el jugador ha hecho durante el tutorial (lo apunta la pantalla de la revuelta). */
export type TutorialSignal = 'camera' | 'zoom' | 'deploy' | 'row' | 'barricade' | 'barricadeEdit' | 'select' | 'move' | 'force' | 'start';

interface TutorialStep {
  title: string;
  /** Texto con teclas entre corchetes: «[W] [A] [S] [D]» se dibujan como teclas. */
  text: string;
  /** Se completa cuando el jugador hace esto. Sin señal: botón «Siguiente». */
  signal?: TutorialSignal;
  /** Para pasos que necesitan repetir la acción (p. ej. colocar varias tropas). */
  check?: (sim: RiotSim) => boolean;
}

const STEPS: readonly TutorialStep[] = [
  {
    title: 'Bienvenido, Generalísimo',
    text: 'Esto es una manifestación pacífica de práctica. La multitud espera quieta mientras aprendes lo básico. Nada de lo que pase aquí cuenta.',
  },
  {
    title: 'Mueve la cámara',
    text: 'Usa [W] [A] [S] [D] (o lleva el ratón al borde de la pantalla) para recorrer la plaza.',
    signal: 'camera',
  },
  {
    title: 'Acércate y gira',
    text: 'Con la [Rueda] del ratón haces zoom. Con [Q] y [E] giras la cámara.',
    signal: 'zoom',
  },
  {
    title: 'Coloca una tropa',
    text: 'Haz clic en la tarjeta «Antidisturbios» de la barra de abajo y luego clic en la plaza para colocarlo.',
    signal: 'deploy',
  },
  {
    title: 'Coloca una hilera',
    text: 'Con una tarjeta elegida, mantén [Shift] para colocar varias en fila. [Shift] + [Rueda] cambia cuántas y [R] gira la fila.',
    signal: 'row',
  },
  {
    title: 'Pon una barricada',
    text: 'Abre la pestaña «Vehículos y defensas» y coloca una barricada en el camino de la multitud. Corta el paso y la desvía.',
    signal: 'barricade',
  },
  {
    title: 'Recoloca la barricada',
    text: 'Haz clic sobre la barricada: aparecen los botones {move} mover y {trash} quitar. Solo funcionan durante la preparación: cuando empiece la protesta quedan fijas.',
    signal: 'barricadeEdit',
  },
  {
    title: 'Selecciona tus tropas',
    text: 'Arrastra un recuadro con el clic izquierdo sobre tus antidisturbios para seleccionarlos. [Doble clic] selecciona todos los de ese tipo.',
    signal: 'select',
  },
  {
    title: 'Dales una orden',
    text: 'Con tropas seleccionadas, haz [Clic derecho] en la plaza: irán allí manteniendo la formación.',
    signal: 'move',
  },
  {
    title: 'Nivel de fuerza',
    text: 'Arriba a la derecha decides cuánta fuerza usan tus tropas, con un clic o con las teclas [1] [2] [3] [4]. Más fuerza dispersa antes, pero enfurece a la gente. Pasa el ratón por un nivel para ver qué hace.',
    signal: 'force',
  },
  {
    title: '¡A la plaza!',
    text: 'Cuando estés listo, pulsa «¡Empezar ya!» arriba. En una partida real tienes un minuto de preparación.',
    signal: 'start',
  },
  {
    title: 'Aguanta',
    text: 'Protege el palacio hasta que acabe el tiempo. Mantén la fuerza en «Contención»: es una protesta pacífica y la mano dura solo la enfurecería. [Espacio] pausa el juego.',
  },
];

/** Panel del tutorial: un paso cada vez, se avanza haciendo lo que pide. */
export class Tutorial {
  private readonly root: HTMLElement;
  private readonly progress: HTMLElement;
  private readonly title: HTMLElement;
  private readonly text: HTMLElement;
  private readonly next: HTMLButtonElement;
  private readonly signals = new Set<TutorialSignal>();
  private index = -1;
  private doneTimer = -1;

  constructor(parent: HTMLElement, private readonly sim: RiotSim) {
    this.progress = h('div', { class: 'tutorial-progress' });
    this.title = h('div', { class: 'tutorial-title' });
    this.text = h('div', { class: 'tutorial-text' });
    this.next = h('button', { class: 'btn primary small', text: 'Siguiente', onClick: () => this.advance() });
    this.root = h('div', { class: 'tutorial panel' }, [
      h('div', { class: 'tutorial-head' }, [h('span', { class: 'tutorial-tag', text: 'Tutorial' }), this.progress]),
      this.title,
      this.text,
      h('div', { class: 'tutorial-actions' }, [this.next]),
    ]);
    parent.append(this.root);
    this.advance();
  }

  /** La pantalla avisa de lo que hace el jugador. */
  signal(s: TutorialSignal): void {
    // Si empieza la protesta antes de tiempo, los pasos de preparación ya no se pueden hacer: saltar al final.
    const startIndex = STEPS.findIndex((step) => step.signal === 'start');
    if (s === 'start' && this.index < startIndex) {
      this.index = startIndex - 1;
      this.advance();
    }
    this.signals.add(s);
  }

  update(frameDt: number): void {
    const step = STEPS[this.index];
    if (!step) return;
    if (this.doneTimer >= 0) {
      this.doneTimer -= frameDt;
      if (this.doneTimer < 0) this.advance();
      return;
    }
    const done = (step.signal && this.signals.has(step.signal)) || step.check?.(this.sim);
    if (done) {
      // Un instante en verde para que se note que lo hizo bien.
      this.root.classList.add('done');
      this.doneTimer = 0.9;
    }
  }

  private advance(): void {
    this.index++;
    this.root.classList.remove('done');
    this.doneTimer = -1;
    const step = STEPS[this.index];
    if (!step) {
      this.root.remove();
      return;
    }
    // Las señales de antes no cuentan para el paso nuevo (salvo que ya estuviera hecho: empezar).
    if (step.signal !== 'start') this.signals.clear();
    this.progress.textContent = `${this.index + 1} / ${STEPS.length}`;
    this.title.textContent = step.title;
    this.text.replaceChildren(...formatText(step.text));
    const manual = !step.signal && !step.check;
    this.next.style.display = manual ? '' : 'none';
    this.next.textContent = this.index === STEPS.length - 1 ? 'Entendido' : 'Siguiente';
  }

  dispose(): void {
    this.root.remove();
  }
}

/** «[W]» → tecla dibujada; «{move}» → icono. */
function formatText(text: string): Node[] {
  const out: Node[] = [];
  for (const part of text.split(/(\[[^\]]+\]|\{[a-z]+\})/)) {
    if (!part) continue;
    if (part.startsWith('[')) out.push(h('kbd', { text: part.slice(1, -1) }));
    else if (part === '{move}') out.push(icon('move', 14));
    else if (part === '{trash}') out.push(icon('trash', 14));
    else out.push(document.createTextNode(part));
  }
  return out;
}
