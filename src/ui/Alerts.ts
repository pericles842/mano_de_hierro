import { DIPLOMACY, diplomacyBlocked, type DiplomacyId } from '../data/diplomacy';
import type { RegimeState } from '../sim/regime';
import { h, money } from './dom';

export interface AlertHandlers {
  diplomacy(id: DiplomacyId): void;
  release(): void;
  payRaise(): void;
}

interface AlertAction {
  label: string;
  run: () => void;
  disabled?: boolean;
}

interface AlertDef {
  id: string;
  icon: string;
  title: string;
  text: string;
  tone: 'bad' | 'warn';
  actions: AlertAction[];
}

/** Alertas descartadas hoy (se recuerdan entre pantallas). */
const dismissed = new Set<string>();

/**
 * Notificaciones del despacho con acciones directas: no hace falta ir a la pestaña Diplomacia
 * para reaccionar a una amenaza de sanciones o a la presión por los presos políticos.
 */
export class Alerts {
  private readonly root: HTMLElement;

  constructor(
    parent: HTMLElement,
    private readonly state: RegimeState,
    private readonly handlers: AlertHandlers,
  ) {
    this.root = h('div', { class: 'alerts' });
    parent.append(this.root);
    this.refresh();
  }

  refresh(): void {
    const s = this.state;
    const visible = buildAlerts(s, this.handlers).filter((a) => !dismissed.has(`${s.day}:${a.id}`));
    this.root.replaceChildren(
      ...visible.map((a) =>
        h('div', { class: `alert-card ${a.tone}` }, [
          h('div', { class: 'alert-head' }, [
            h('span', { class: 'alert-icon', text: a.icon }),
            h('strong', { text: a.title }),
            h('button', {
              class: 'alert-close',
              text: '×',
              title: 'Descartar por hoy',
              onClick: () => {
                dismissed.add(`${s.day}:${a.id}`);
                this.refresh();
              },
            }),
          ]),
          h('div', { class: 'alert-text', text: a.text }),
          h(
            'div',
            { class: 'alert-actions' },
            a.actions.map((act) => h('button', { class: 'btn small', text: act.label, disabled: act.disabled === true, onClick: act.run })),
          ),
        ]),
      ),
    );
  }

  dispose(): void {
    this.root.remove();
  }
}

function buildAlerts(s: RegimeState, handlers: AlertHandlers): AlertDef[] {
  const alerts: AlertDef[] = [];
  const diplo = (id: DiplomacyId): AlertAction => {
    const a = DIPLOMACY.find((d) => d.id === id)!;
    const cost = a.effects.treasury ?? 0;
    const used = s.diplomacyUsed.includes(id);
    return {
      label: `${a.icon} ${a.name}${cost < 0 ? ` (${money(-cost)})` : ''}`,
      run: () => handlers.diplomacy(id),
      disabled: used || diplomacyBlocked(a, s.intlPressure) !== null || (cost < 0 && s.treasury < -cost),
    };
  };

  if (s.intlPressure > 35) {
    const actions = [diplo('cumbre'), diplo('lobby')];
    if (s.prisoners > 0) actions.unshift({ label: `🕊️ Liberar presos (${s.prisoners})`, run: handlers.release });
    alerts.push({
      id: 'sanciones',
      icon: '🌍',
      title: s.intlPressure > 60 ? 'El mundo te da la espalda' : 'Amenaza de sanciones',
      text: `La presión internacional está en ${Math.round(s.intlPressure)}%. Tus ingresos ya se resienten.`,
      tone: 'bad',
      actions,
    });
  }
  if (s.prisoners >= 3) {
    alerts.push({
      id: 'presos',
      icon: '⛓️',
      title: `${s.prisoners} presos políticos`,
      text: 'Las ONG y las familias exigen su liberación. Puedes liberarlos como gesto o canjearlos por ayuda exterior.',
      tone: 'warn',
      actions: [{ label: '⛓️ Decidir sobre los presos', run: handlers.release }],
    });
  }
  if (s.treasury < 400) {
    alerts.push({
      id: 'arcas',
      icon: '💸',
      title: 'Arcas casi vacías',
      text: `Quedan ${money(s.treasury)}. Si no puedes pagar a las tropas, la lealtad se desplomará.`,
      tone: 'bad',
      actions: [diplo('comercio'), diplo('aliado')],
    });
  }
  if (s.loyalty < 40) {
    alerts.push({
      id: 'cuarteles',
      icon: '🪖',
      title: 'Malestar en los cuarteles',
      text: `Lealtad militar al ${Math.round(s.loyalty)}%. Si llega a 0, golpe de Estado.`,
      tone: 'bad',
      actions: [{ label: '💰 Subir el sueldo (Generoso)', run: handlers.payRaise, disabled: s.payLevel === 2 }],
    });
  }
  if (s.popularity < 30) {
    alerts.push({
      id: 'popularidad',
      icon: '📉',
      title: 'Popularidad por los suelos',
      text: `Solo el ${Math.round(s.popularity)}% te apoya. Si llega a 0, revolución.`,
      tone: 'bad',
      actions: [diplo('onu')],
    });
  }
  return alerts.slice(0, 3);
}
