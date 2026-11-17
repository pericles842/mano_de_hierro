import { CAMPAIGN_DAYS, COUNTRY, DICTATOR, GAME_TAGLINE, GAME_TITLE, NAME_MAX_LENGTH } from '../data/country';
import { CROWD_STAGES } from '../data/crowdStages';
import type { EventOption, GameEventDef } from '../data/events';
import { FORCE_LEVELS } from '../data/forceLevels';
import type { RiotDef } from '../data/riots';
import { releaseEffects, type DayReport, type Deltas, type PlayerNames, type RegimeState, type ReleaseMode } from '../sim/regime';
import type { RiotResult } from '../sim/riot/types';
import { h, money, signed } from './dom';

interface ModalButton {
  label: string;
  primary?: boolean;
  /** Devuelve false para impedir que se cierre el modal. */
  onClick?: () => boolean | void;
}

export function showModal(parent: HTMLElement, title: string, body: Node[], buttons: ModalButton[], extraClass = ''): void {
  const overlay = h('div', { class: 'modal-overlay' });
  const actions = buttons.map((b) =>
    h('button', {
      class: `btn ${b.primary ? 'primary' : 'ghost'}`,
      text: b.label,
      onClick: () => {
        if (b.onClick?.() === false) return;
        overlay.remove();
      },
    }),
  );
  overlay.append(
    h('div', { class: `modal panel ${extraClass}` }, [
      h('div', { class: 'modal-title', text: title }),
      h('div', { class: 'modal-body' }, body),
      h('div', { class: 'modal-actions' }, actions),
    ]),
  );
  parent.append(overlay);
}

function nameField(label: string, value: string, placeholder: string): { wrap: HTMLElement; input: HTMLInputElement } {
  const input = h('input', {
    class: 'text-input',
    attrs: { type: 'text', maxlength: String(NAME_MAX_LENGTH), value, placeholder, spellcheck: 'false' },
  });
  return { wrap: h('label', { class: 'field' }, [h('span', { text: label }), input]), input };
}

function cleanName(raw: string, fallback: string): string {
  const name = raw.replace(/\s+/g, ' ').trim().slice(0, NAME_MAX_LENGTH);
  return name.length > 0 ? name : fallback;
}

/**
 * Pantalla de inicio: título, nombres del dictador y de la capital, y la pregunta
 * «¿primera vez en el poder?» (que lleva al tutorial).
 */
export function showSetup(parent: HTMLElement, defaults: PlayerNames, onStart: (names: PlayerNames, tutorial: boolean) => void): void {
  const ruler = nameField('Tu nombre, Generalísimo', defaults.rulerName, DICTATOR.name);
  const city = nameField('Nombre de la capital', defaults.cityName, COUNTRY.capital);
  const names = (): PlayerNames => ({
    rulerName: cleanName(ruler.input.value, DICTATOR.name),
    cityName: cleanName(city.input.value, COUNTRY.capital),
  });
  const start = (): void => onStart(names(), false);
  for (const input of [ruler.input, city.input]) {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        parent.querySelector('.modal.intro')?.closest('.modal-overlay')?.remove();
        start();
      }
    });
  }

  showModal(
    parent,
    GAME_TITLE,
    [
      h('p', { class: 'tagline', text: GAME_TAGLINE }),
      h('p', {}, [
        'Bienvenido de nuevo al poder en la ',
        h('strong', { text: COUNTRY.name }),
        `. ${DICTATOR.honorifics.join(', ')}... el pueblo te adora (oficialmente).`,
      ]),
      h('div', { class: 'fields' }, [ruler.wrap, city.wrap]),
      h('p', {
        text: 'Cada día estallan revueltas por todo el país. Elige cuál sofocar, coloca a tus tropas en la Plaza de la Patria y protege el palacio.',
      }),
      h('ul', {}, [
        h('li', { text: `Sobrevive ${CAMPAIGN_DAYS} días.` }),
        h('li', { text: 'Las protestas empiezan pacíficas... a más mano dura, más locura: se arman con piedras, palos y bombas incendiarias.' }),
        h('li', { text: 'La gente recuerda: la represión sube la molestia social y la presión internacional.' }),
        h('li', { text: 'Lealtad militar a 0: golpe de Estado. Popularidad a 0: revolución.' }),
      ]),
      h('p', { class: 'setup-question', text: '¿Es tu primera vez en el poder?' }),
    ],
    [
      { label: 'Es mi primera vez: enséñame', onClick: () => onStart(names(), true) },
      { label: 'Tomar el poder otra vez', primary: true, onClick: start },
    ],
    'intro',
  );
  window.setTimeout(() => ruler.input.select(), 50);
}

function deltaRows(d: Deltas): HTMLElement {
  const row = (label: string, value: number, goodWhenPositive: boolean, fmt: (n: number) => string): HTMLElement => {
    const r = Math.round(value);
    const tone = r === 0 ? '' : r > 0 === goodWhenPositive ? 'good' : 'bad';
    return h('div', { class: 'delta-row' }, [h('span', { text: label }), h('span', { class: tone, text: fmt(value) })]);
  };
  return h('div', { class: 'deltas' }, [
    row('Tesoro', d.treasury, true, (n) => (Math.round(n) > 0 ? '+' : '') + money(n)),
    row('Popularidad', d.popularity, true, (n) => signed(n, '%')),
    row('Molestia social', d.unrest, false, (n) => signed(n, '%')),
    row('Presión internacional', d.intlPressure, false, (n) => signed(n, '%')),
    row('Lealtad militar', d.loyalty, true, (n) => signed(n, '%')),
  ]);
}

export interface RiotSummary {
  def: RiotDef;
  result: RiotResult;
  deltas: Deltas;
}

export function showDayReport(
  parent: HTMLElement,
  state: RegimeState,
  riot: RiotSummary | null,
  report: DayReport,
  onClose: () => void,
): void {
  const body: Node[] = [];
  if (riot) {
    const { result } = riot;
    const forceName = FORCE_LEVELS[Math.round(result.avgForce)].name;
    const peak = CROWD_STAGES[result.peakStage];
    body.push(
      h('h3', { text: result.won ? `✅ ${riot.def.name}: sofocada` : `❌ ${riot.def.name}: el palacio ha caído` }),
      h('p', {
        class: 'hint',
        text: result.won
          ? result.reason === 'cleared'
            ? 'La plaza quedó vacía. La TV estatal emite dibujos animados.'
            : 'Los manifestantes se cansaron y se fueron a casa. Por hoy.'
          : `El palacio terminó en manos de los manifestantes tras ${Math.round(result.occupiedSeconds)} s de ocupación. Pasaste la tarde en el armario de los trajes de gala.`,
      }),
      ...(result.won && result.palaceFallen
        ? [h('p', { class: 'hint', text: `Recuperaste el palacio, pero estuvo tomado ${Math.round(result.occupiedSeconds)} s y las imágenes dieron la vuelta al mundo.` })]
        : []),
      h('p', {
        text: `Dispersados: ${result.dispersed}/${result.total} · Fuerza media: ${forceName} · Peor momento: ${peak.icon} ${peak.name} · Arrestos: ${result.arrests} · Unidades retiradas: ${result.brokenUnits}`,
      }),
      ...(result.deaths + result.injured + result.soldiersKilled > 0
        ? [
            h('p', {
              class: 'bad',
              text: `🩸 Muertos: ${result.deaths}${result.leadersKilled > 0 ? ` (${result.leadersKilled} líderes, ahora mártires)` : ''} · Heridos: ${result.injured} · Agentes caídos: ${result.soldiersKilled}`,
            }),
          ]
        : []),
      deltaRows(riot.deltas),
    );
  }
  body.push(
    h('h3', { text: 'Balance del día' }),
    h('p', { text: `Impuestos recaudados ${money(report.income)} · Sueldos y mantenimiento ${money(report.upkeep)}` }),
    ...report.notes.map((n) => h('p', { class: 'hint', text: `• ${n}` })),
    deltaRows(report.deltas),
  );
  const title = state.status === 'playing' ? `Amanece el día ${state.day}` : 'Fin del mandato';
  showModal(parent, title, body, [{ label: 'Continuar', primary: true, onClick: onClose }]);
}

export function fillNames(text: string, state: RegimeState): string {
  return text.replaceAll('{ruler}', `${DICTATOR.title} ${state.rulerName}`).replaceAll('{city}', state.cityName);
}

function effectHint(option: EventOption): string {
  const e = option.effects;
  const parts: string[] = [];
  if (e.treasury) parts.push(`${e.treasury > 0 ? '+' : ''}${money(e.treasury)}`);
  if (e.popularity) parts.push(`Popularidad ${signed(e.popularity)}`);
  if (e.unrest) parts.push(`Molestia ${signed(e.unrest)}`);
  if (e.intlPressure) parts.push(`Presión ${signed(e.intlPressure)}`);
  if (e.loyalty) parts.push(`Lealtad ${signed(e.loyalty)}`);
  return parts.join(' · ');
}

/** Evento del despacho: una decisión con consecuencias. */
export function showEvent(
  parent: HTMLElement,
  state: RegimeState,
  event: GameEventDef,
  onChoose: (option: EventOption) => Deltas,
): void {
  showModal(
    parent,
    `${event.icon} ${event.title}`,
    [
      h('p', { text: fillNames(event.text, state) }),
      h(
        'div',
        { class: 'event-options' },
        event.options.map((option) =>
          h('div', { class: 'event-hint' }, [h('strong', { text: option.label }), h('span', { text: effectHint(option) || 'Sin efectos inmediatos' })]),
        ),
      ),
    ],
    event.options.map((option, i) => ({
      label: option.label,
      primary: i === 0,
      onClick: () => {
        const deltas = onChoose(option);
        showModal(parent, `${event.icon} ${option.label}`, [h('p', { text: fillNames(option.outcome, state) }), deltaRows(deltas)], [
          { label: 'Continuar', primary: true },
        ]);
      },
    })),
    'event',
  );
}

/** Has perdido la protesta (el palacio cayó): reintentar gratis o volver al despacho sin pasar el día. */
export function showRiotLost(
  parent: HTMLElement,
  def: RiotDef,
  result: RiotResult,
  handlers: { onRetry: () => void; onBack: () => void },
): void {
  showModal(
    parent,
    `🏛️ ${def.name}: el palacio ha caído`,
    [
      h('p', { text: 'Los manifestantes tomaron la escalinata del palacio. Esta protesta la has perdido... pero el día no ha terminado.' }),
      h('p', {
        class: 'hint',
        text: `Aguantaste ${Math.round(result.elapsed)} s · Dispersados: ${result.dispersed}/${result.total} · Detenidos: ${result.arrests}${result.deaths > 0 ? ` · Muertos: ${result.deaths}` : ''}`,
      }),
      h('p', { text: 'Puedes reintentarla con otra estrategia, o volver al despacho y, si quieres, terminar el día sin intervenir (botón de la pestaña Revueltas).' }),
    ],
    [
      { label: 'Volver al despacho', onClick: handlers.onBack },
      { label: '🔁 Reintentar la protesta', primary: true, onClick: handlers.onRetry },
    ],
    'lose',
  );
}

/** Elegir cuántos presos políticos liberar y cómo (gesto o canje). */
export function showReleasePrisoners(
  parent: HTMLElement,
  state: RegimeState,
  onConfirm: (count: number, mode: ReleaseMode) => Deltas | null,
): void {
  if (state.prisoners <= 0) {
    showModal(
      parent,
      '⛓️ Presos políticos',
      [
        h('p', { text: 'No tienes presos políticos. Sin esa moneda de cambio, el exterior no tiene nada que pedirte... ni nada que temer.' }),
        h('p', { class: 'hint', text: 'Los equipos de captura arrestan líderes durante las revueltas.' }),
      ],
      [{ label: 'Entendido', primary: true }],
    );
    return;
  }
  let mode: ReleaseMode = 'gesto';
  const max = state.prisoners;
  const countLabel = h('strong', { class: 'release-count' });
  const preview = h('div');
  const slider = h('input', { class: 'slider', attrs: { type: 'range', min: '1', max: String(max), step: '1', value: String(Math.ceil(max / 2)) } });
  const modeButtons = (['gesto', 'canje'] as const).map((m) =>
    h('button', {
      class: 'chip',
      text: m === 'gesto' ? '🕊️ Gesto de buena voluntad' : '💰 Canje por ayuda exterior',
      onClick: () => {
        mode = m;
        update();
      },
    }),
  );
  const update = (): void => {
    const n = Number(slider.value);
    countLabel.textContent = `${n} de ${max}`;
    modeButtons.forEach((b, i) => b.classList.toggle('active', (i === 0 ? 'gesto' : 'canje') === mode));
    preview.replaceChildren(deltaRows(releaseEffects(n, mode)));
  };
  slider.addEventListener('input', update);
  update();

  showModal(
    parent,
    '⛓️ Liberar presos políticos',
    [
      h('p', { text: `Tienes ${max} presos políticos. Son tu mejor moneda de cambio con el exterior, pero mantenerlos encerrados sube cada día la presión internacional y la molestia social.` }),
      h('div', { class: 'chips wrap' }, modeButtons),
      h('div', { class: 'cp-row' }, [h('span', { text: '¿Cuántos liberar?' }), countLabel]),
      slider,
      h('h3', { text: 'Consecuencias' }),
      preview,
    ],
    [
      { label: 'Cancelar' },
      {
        label: 'Liberar',
        primary: true,
        onClick: () => {
          const deltas = onConfirm(Number(slider.value), mode);
          if (deltas) {
            showModal(parent, '⛓️ Presos liberados', [h('p', { text: mode === 'canje' ? 'El canje se cierra en un aeropuerto discreto. Llega la ayuda.' : 'Las familias celebran a las puertas de la cárcel. El mundo aplaude.' }), deltaRows(deltas)], [
              { label: 'Continuar', primary: true },
            ]);
          }
        },
      },
    ],
    'event',
  );
}

export function showGameOver(parent: HTMLElement, state: RegimeState, onRestart: () => void): void {
  const ruler = `${DICTATOR.title} ${state.rulerName}`;
  const texts: Record<Exclude<RegimeState['status'], 'playing'>, [string, string]> = {
    coup: [
      '¡Golpe de Estado!',
      `El coronel Cuchufleta ha tomado la TV estatal de ${state.cityName} y lee un comunicado con el bigote postizo del ${ruler}. Las tropas, mal pagadas y hartas, aplauden.`,
    ],
    revolution: [
      'La revolución triunfa',
      `El pueblo rodea el palacio de ${state.cityName}. El ${ruler} huye en helicóptero con tres maletas de pomposos y su colección de medallas.`,
    ],
    victory: [
      '¡Sobreviviste!',
      `${state.maxDays} días después, el ${ruler} sigue en el sillón. La TV estatal asegura que el 104% del pueblo te ama.`,
    ],
  };
  const [title, text] = state.status === 'playing' ? ['', ''] : texts[state.status];
  showModal(
    parent,
    title,
    [
      h('p', { text }),
      h('p', {
        class: 'hint',
        text: `Día ${Math.min(state.day, state.maxDays)} · Tesoro ${money(state.treasury)} · Popularidad ${Math.round(state.popularity)}% · Molestia ${Math.round(state.unrest)}% · Presión ${Math.round(state.intlPressure)}% · Lealtad ${Math.round(state.loyalty)}%`,
      }),
    ],
    [{ label: 'Jugar de nuevo', primary: true, onClick: onRestart }],
    state.status === 'victory' ? 'win' : 'lose',
  );
}
