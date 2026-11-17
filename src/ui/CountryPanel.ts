import { DICTATOR } from '../data/country';
import { RIOTS } from '../data/riots';
import { UNITS, UNIT_ORDER } from '../data/units';
import { UPGRADES, UPGRADE_ORDER } from '../data/upgrades';
import {
  PAY_LEVELS,
  buyUnit,
  buyUpgrade,
  projectedIncome,
  projectedUpkeep,
  setPayLevel,
  setTaxRate,
  type PayLevel,
  type RegimeState,
} from '../sim/regime';
import { h, money } from './dom';

export interface CountryPanelHandlers {
  onChange(): void;
  onSelectRiot(uid: number): void;
  onSkipDay(): void;
}

/** Despacho del Generalísimo: impuestos, sueldos, arsenal y revueltas activas. */
export class CountryPanel {
  private readonly root: HTMLElement;
  private selectedUid: number | null = null;

  constructor(
    parent: HTMLElement,
    private readonly state: RegimeState,
    private readonly handlers: CountryPanelHandlers,
  ) {
    this.root = h('aside', { class: 'panel country-panel' });
    parent.append(this.root);
    this.refresh();
  }

  select(uid: number | null): void {
    this.selectedUid = uid;
    this.refresh();
  }

  refresh(): void {
    const s = this.state;
    const economy = h('div', { class: 'economy-line' });
    const taxLabel = h('span', { class: 'tax-value' });
    const taxMood = h('div', { class: 'hint' });
    const updateEconomy = (): void => {
      taxLabel.textContent = `${Math.round(s.taxRate * 100)}%`;
      economy.textContent = `Ingresos ${money(projectedIncome(s))}/día · Gastos ${money(projectedUpkeep(s))}/día`;
      taxMood.textContent =
        s.taxRate > 0.35
          ? 'El pueblo echa humo. La popularidad caerá rápido.'
          : s.taxRate > 0.2
            ? 'El pueblo refunfuña.'
            : s.taxRate < 0.12
              ? 'El pueblo te adora... y las arcas lloran.'
              : 'El pueblo lo tolera.';
    };

    const slider = h('input', {
      class: 'slider',
      attrs: { type: 'range', min: '0', max: '60', step: '1', value: String(Math.round(s.taxRate * 100)) },
    });
    slider.addEventListener('input', () => {
      setTaxRate(s, Number(slider.value) / 100);
      updateEconomy();
      this.handlers.onChange();
    });
    updateEconomy();

    const payButtons = PAY_LEVELS.map((level, i) =>
      h('button', {
        class: `chip ${s.payLevel === i ? 'active' : ''}`,
        text: level.name,
        onClick: () => {
          setPayLevel(s, i as PayLevel);
          this.handlers.onChange();
          this.refresh();
        },
      }),
    );

    const arsenal = UNIT_ORDER.map((type) => {
      const def = UNITS[type];
      return h('div', { class: 'arsenal-row', title: def.description }, [
        h('span', { class: 'arsenal-icon', text: def.icon }),
        h('span', { class: 'arsenal-name', text: def.name }),
        h('span', { class: 'arsenal-count', text: `×${s.stock[type]}` }),
        h('button', {
          class: 'btn small',
          text: `+1 · ${money(def.price)}`,
          disabled: s.treasury < def.price,
          onClick: () => {
            if (buyUnit(s, type)) {
              this.handlers.onChange();
              this.refresh();
            }
          },
        }),
      ]);
    });

    const upgrades = UPGRADE_ORDER.map((id) => {
      const def = UPGRADES[id];
      const owned = s.upgrades.includes(id);
      return h('div', { class: `arsenal-row upgrade-row ${owned ? 'owned' : ''}`, title: def.description }, [
        h('span', { class: 'arsenal-icon', text: def.icon }),
        h('span', { class: 'arsenal-name' }, [def.name, h('div', { class: 'upgrade-desc', text: def.description })]),
        owned
          ? h('span', { class: 'upgrade-owned', text: '✔ Instalada' })
          : h('button', {
              class: 'btn small',
              text: money(def.price),
              disabled: s.treasury < def.price,
              onClick: () => {
                if (buyUpgrade(s, id)) {
                  this.handlers.onChange();
                  this.refresh();
                }
              },
            }),
      ]);
    });

    const riots = s.activeRiots.map((riot) => {
      const def = RIOTS[riot.defId];
      return h(
        'button',
        {
          class: `riot-card ${this.selectedUid === riot.uid ? 'active' : ''}`,
          onClick: () => this.handlers.onSelectRiot(riot.uid),
        },
        [
          h('div', { class: 'riot-card-name', text: `🔥 ${def.name}` }),
          h('div', { class: 'riot-card-meta', text: `${def.region} · ~${Math.round(def.protesters * riot.scale)} manifestantes` }),
        ],
      );
    });

    this.root.replaceChildren(
      h('div', { class: 'panel-title', text: 'Despacho del Generalísimo' }),
      h('div', { class: 'panel-subtitle', text: `${DICTATOR.title} ${s.rulerName}, «${DICTATOR.nickname}»` }),
      h('section', {}, [
        h('h3', {}, ['Impuestos ', taxLabel]),
        slider,
        taxMood,
        economy,
      ]),
      h('section', {}, [h('h3', { text: 'Sueldo de las tropas' }), h('div', { class: 'chips' }, payButtons)]),
      h('section', {}, [h('h3', { text: 'Arsenal' }), ...arsenal]),
      h('section', {}, [h('h3', { text: 'Mejoras' }), ...upgrades]),
      h('section', {}, [
        h('h3', { text: 'Revueltas en curso' }),
        h('div', { class: 'hint', text: 'Solo puedes sofocar una por día. Las demás dañarán tu popularidad.' }),
        ...riots,
        h('button', { class: 'btn ghost wide', text: 'Terminar el día sin intervenir', onClick: () => this.handlers.onSkipDay() }),
      ]),
    );
  }

  dispose(): void {
    this.root.remove();
  }
}
