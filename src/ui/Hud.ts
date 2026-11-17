import { audio } from '../audio/AudioEngine';
import { COUNTRY, GAME_TITLE } from '../data/country';
import { internationalStatus } from '../data/diplomacy';
import { projectedIncome, projectedUpkeep, type RegimeState } from '../sim/regime';
import { bar, h, money, signed } from './dom';

export interface HudHandlers {
  /** Botón temporal de modo developer. */
  onDevToggle(): void;
  onPrisoners(): void;
}

/** Barra superior con los indicadores del régimen. */
export class Hud {
  private readonly root: HTMLElement;
  private last: RegimeState | null = null;
  private dev = false;

  constructor(
    parent: HTMLElement,
    private readonly handlers: HudHandlers,
  ) {
    this.root = h('div', { class: 'hud' });
    parent.append(this.root);
  }

  setVisible(visible: boolean): void {
    this.root.style.display = visible ? '' : 'none';
  }

  update(s: RegimeState, dev = this.dev): void {
    this.last = s;
    this.dev = dev;
    const net = projectedIncome(s) - projectedUpkeep(s);
    const status = internationalStatus(s.intlPressure);
    this.root.replaceChildren(
      h('div', { class: 'hud-brand' }, [
        h('span', { class: 'hud-flag' }),
        h('div', {}, [
          h('div', { class: 'hud-country', text: `${GAME_TITLE} · ${COUNTRY.shortName}` }),
          h('div', { class: 'hud-day', text: `${s.cityName} · Día ${Math.min(s.day, s.maxDays)} de ${s.maxDays}` }),
        ]),
      ]),
      stat('Tesoro', money(s.treasury), `${signed(net)}/día`, null, net >= 0 ? 'good' : 'bad'),
      stat('Popularidad', `${Math.round(s.popularity)}%`, null, bar(s.popularity, s.popularity < 30 ? 'bad' : 'good')),
      stat('Molestia social', `${Math.round(s.unrest)}%`, null, bar(s.unrest, s.unrest > 50 ? 'bad' : 'neutral')),
      stat('Presión internacional', `${Math.round(s.intlPressure)}%`, null, bar(s.intlPressure, s.intlPressure > 35 ? 'bad' : 'neutral')),
      stat('Lealtad militar', `${Math.round(s.loyalty)}%`, null, bar(s.loyalty, s.loyalty < 30 ? 'bad' : 'good')),
      h('div', { class: `hud-status ${status.tone}`, title: 'Estatus internacional' }, [
        h('div', { class: 'hud-label', text: 'Estatus' }),
        h('div', { class: 'hud-status-value', text: `${status.icon} ${status.name}` }),
      ]),
      h('button', { class: 'hud-prisoners', title: 'Presos políticos: moneda de cambio con el exterior', onClick: () => this.handlers.onPrisoners() }, [
        h('div', { class: 'hud-label', text: 'Presos' }),
        h('div', { class: 'hud-value', text: `⛓️ ${s.prisoners}` }),
      ]),
      h('div', { class: 'hud-buttons' }, [
        h('button', {
          class: `chip dev-btn ${dev ? 'active' : ''}`,
          text: dev ? '🛠 DEV ON' : '🛠 DEV',
          title: 'Modo developer: desbloquea todas las tropas (temporal)',
          onClick: () => this.handlers.onDevToggle(),
        }),
        h('button', {
          class: 'chip',
          text: audio.muted ? '🔇' : '🔊',
          title: 'Sonido',
          onClick: () => {
            audio.toggleMute();
            if (this.last) this.update(this.last);
          },
        }),
      ]),
    );
  }
}

function stat(
  label: string,
  value: string,
  sub: string | null,
  barEl: HTMLElement | null,
  subTone: 'good' | 'bad' = 'good',
): HTMLElement {
  return h('div', { class: 'hud-stat' }, [
    h('div', { class: 'hud-label', text: label }),
    h('div', { class: 'hud-value' }, [value, sub ? h('span', { class: `hud-sub ${subTone}`, text: ` ${sub}` }) : null]),
    barEl,
  ]);
}
