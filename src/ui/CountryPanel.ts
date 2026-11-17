import { DICTATOR } from '../data/country';
import { CROWD_STAGES, stageForAnger } from '../data/crowdStages';
import { DIPLOMACY, diplomacyBlocked, internationalStatus, type DiplomacyAction } from '../data/diplomacy';
import { RIOTS } from '../data/riots';
import { BUYABLE_UNITS, CATEGORY_NAMES, UNITS, UNIT_ORDER, type UnitCategory } from '../data/units';
import { UPGRADES, UPGRADE_BRANCHES, UPGRADE_ORDER, type UpgradeBranch, type UpgradeId } from '../data/upgrades';
import {
  EMERGENCY_ARMY_SQUADS,
  EMERGENCY_COST,
  PAY_LEVELS,
  buyUnit,
  buyUpgrade,
  declareEmergency,
  projectedIncome,
  projectedUpkeep,
  sanctionsFactor,
  setPayLevel,
  setTaxRate,
  useDiplomacy,
  type PayLevel,
  type RegimeState,
} from '../sim/regime';
import { initialAnger } from '../sim/riot/RiotSim';
import { bar, h, money, signed } from './dom';

export interface CountryPanelHandlers {
  onChange(): void;
  onEmergency(): void;
  onDiplomacy(action: DiplomacyAction): void;
  onRelease(): void;
  onSelectRiot(uid: number): void;
  onSkipDay(): void;
}

type Tab = 'revueltas' | 'economia' | 'ejercito' | 'diplomacia';

const TABS: readonly { id: Tab; icon: string; name: string }[] = [
  { id: 'revueltas', icon: '🔥', name: 'Revueltas' },
  { id: 'economia', icon: '💰', name: 'Economía' },
  { id: 'ejercito', icon: '🪖', name: 'Ejército' },
  { id: 'diplomacia', icon: '🌍', name: 'Diplomacia' },
];

/** Mejoras que se gestionan desde Economía (el resto va en Ejército). */
const ECONOMY_UPGRADES: readonly UpgradeId[] = ['propaganda'];

/** Se recuerda entre días para no perder la pestaña al volver al despacho. */
let lastTab: Tab = 'revueltas';

type Effects = { treasury?: number; popularity?: number; intlPressure?: number; loyalty?: number; unrest?: number };

/** Despacho del Generalísimo: panel con pestañas para gobernar el país. */
export class CountryPanel {
  private readonly root: HTMLElement;
  private readonly body: HTMLElement;
  private readonly tabBar: HTMLElement;
  private selectedUid: number | null = null;

  constructor(
    parent: HTMLElement,
    private readonly state: RegimeState,
    private readonly handlers: CountryPanelHandlers,
  ) {
    this.tabBar = h('nav', { class: 'cp-tabs' });
    this.body = h('div', { class: 'cp-body' });
    this.root = h('aside', { class: 'panel country-panel' }, [
      h('header', { class: 'cp-header' }, [
        h('div', { class: 'panel-title', text: 'Despacho del Generalísimo' }),
        h('div', { class: 'panel-subtitle', text: `${DICTATOR.title} ${state.rulerName}, «${DICTATOR.nickname}»` }),
      ]),
      this.tabBar,
      this.body,
    ]);
    parent.append(this.root);
    this.refresh();
  }

  select(uid: number | null): void {
    this.selectedUid = uid;
    if (uid !== null) lastTab = 'revueltas';
    this.refresh();
  }

  private change(): void {
    this.handlers.onChange();
    this.refresh();
  }

  refresh(): void {
    const scroll = this.body.scrollTop;
    this.tabBar.replaceChildren(
      ...TABS.map((t) => {
        const badge = t.id === 'revueltas' ? this.state.activeRiots.length : 0;
        return h('button', { class: `cp-tab ${lastTab === t.id ? 'active' : ''}`, onClick: () => this.setTab(t.id) }, [
          h('span', { class: 'cp-tab-icon', text: t.icon }),
          h('span', { text: t.name }),
          badge > 0 ? h('span', { class: 'cp-badge', text: String(badge) }) : null,
        ]);
      }),
    );
    const content: Record<Tab, () => Node[]> = {
      revueltas: () => this.riotsTab(),
      economia: () => this.economyTab(),
      ejercito: () => this.armyTab(),
      diplomacia: () => this.diplomacyTab(),
    };
    this.body.replaceChildren(...content[lastTab]());
    window.requestAnimationFrame(() => (this.body.scrollTop = scroll));
  }

  private setTab(tab: Tab): void {
    lastTab = tab;
    this.body.scrollTop = 0;
    this.refresh();
  }

  // ─── Revueltas ─────────────────────────────────────────────────────────

  private riotsTab(): Node[] {
    const s = this.state;
    const cards = s.activeRiots.map((riot) => {
      const def = RIOTS[riot.defId];
      const mood = CROWD_STAGES[stageForAnger(initialAnger(def, s.unrest))];
      return h(
        'button',
        { class: `riot-card ${this.selectedUid === riot.uid ? 'active' : ''}`, onClick: () => this.handlers.onSelectRiot(riot.uid) },
        [
          h('div', { class: 'riot-card-name', text: `🔥 ${def.name}` }),
          h('div', { class: 'riot-card-meta' }, [
            `${def.region} · ~${Math.round(def.protesters * riot.scale)} personas · `,
            h('span', { style: `color:${mood.color}`, text: `${mood.icon} ${mood.name}` }),
          ]),
        ],
      );
    });
    return [
      h('div', { class: 'cp-tiles' }, [
        tile('Molestia social', `${Math.round(s.unrest)}%`, bar(s.unrest, s.unrest > 50 ? 'bad' : 'neutral')),
        tile('Popularidad', `${Math.round(s.popularity)}%`, bar(s.popularity, s.popularity < 30 ? 'bad' : 'good')),
      ]),
      section('Revueltas en curso', 'Solo puedes sofocar una por día. Las que ignores restarán popularidad y subirán la molestia.', [
        ...cards,
        h('button', { class: 'btn ghost wide', text: 'Terminar el día sin intervenir', onClick: () => this.handlers.onSkipDay() }),
      ]),
    ];
  }

  // ─── Economía ──────────────────────────────────────────────────────────

  private economyTab(): Node[] {
    const s = this.state;
    const income = projectedIncome(s);
    const upkeep = projectedUpkeep(s);
    const net = income - upkeep;
    const incomeEl = h('div', { class: 'cp-tile-value', text: money(income) });
    const netEl = h('div', { class: `cp-tile-value ${net >= 0 ? 'good' : 'bad'}`, text: signed(net) });
    const taxLabel = h('span', { class: 'tax-value', text: `${Math.round(s.taxRate * 100)}%` });
    const mood = h('div', { class: 'hint', text: taxMood(s.taxRate) });

    const slider = h('input', {
      class: 'slider',
      attrs: { type: 'range', min: '0', max: '60', step: '1', value: String(Math.round(s.taxRate * 100)) },
    });
    slider.addEventListener('input', () => {
      setTaxRate(s, Number(slider.value) / 100);
      const newIncome = projectedIncome(s);
      const newNet = newIncome - projectedUpkeep(s);
      taxLabel.textContent = `${Math.round(s.taxRate * 100)}%`;
      incomeEl.textContent = money(newIncome);
      netEl.textContent = signed(newNet);
      netEl.className = `cp-tile-value ${newNet >= 0 ? 'good' : 'bad'}`;
      mood.textContent = taxMood(s.taxRate);
      this.handlers.onChange();
    });

    const sanctions = sanctionsFactor(s);
    const payButtons = PAY_LEVELS.map((level, i) =>
      h('button', {
        class: `chip ${s.payLevel === i ? 'active' : ''}`,
        text: `${level.name} (${signed(level.loyalty)} lealtad)`,
        onClick: () => {
          setPayLevel(s, i as PayLevel);
          this.change();
        },
      }),
    );

    // Gastos por tipo de unidad, de mayor a menor.
    const costRows = UNIT_ORDER.filter((t) => s.stock[t] > 0 && UNITS[t].upkeep > 0)
      .map((t) => ({ t, cost: Math.round(s.stock[t] * UNITS[t].upkeep * PAY_LEVELS[s.payLevel].mult) }))
      .sort((a, b) => b.cost - a.cost)
      .slice(0, 6)
      .map(({ t, cost }) =>
        h('div', { class: 'cp-row' }, [h('span', { text: `${UNITS[t].icon} ${UNITS[t].name} ×${s.stock[t]}` }), h('span', { class: 'bad', text: `-${money(cost)}` })]),
      );

    return [
      h('div', { class: 'cp-tiles three' }, [
        tile('Tesoro', money(s.treasury)),
        h('div', { class: 'cp-tile' }, [h('div', { class: 'hud-label', text: 'Ingresos/día' }), incomeEl]),
        h('div', { class: 'cp-tile' }, [h('div', { class: 'hud-label', text: 'Balance/día' }), netEl]),
      ]),
      section('Impuestos', null, [h('div', { class: 'cp-row' }, [h('span', { text: 'Tasa' }), taxLabel]), slider, mood]),
      section('Sueldo de las tropas', 'Más sueldo = más lealtad y menos riesgo de golpe.', [h('div', { class: 'chips wrap' }, payButtons)]),
      section('Gastos de mantenimiento', `Total: ${money(upkeep)}/día`, costRows),
      sanctions < 1
        ? h('div', { class: 'cp-alert', text: `🌍 Sanciones internacionales: tus ingresos se reducen un ${Math.round((1 - sanctions) * 100)}%.` })
        : null,
      section('Medios de comunicación', null, ECONOMY_UPGRADES.map((id) => this.upgradeRow(id))),
    ].filter((n): n is HTMLElement => n !== null);
  }

  // ─── Ejército ──────────────────────────────────────────────────────────

  private armyTab(): Node[] {
    const s = this.state;
    const troops = BUYABLE_UNITS.reduce((n, t) => n + s.stock[t], 0);
    const groups = (Object.keys(CATEGORY_NAMES) as UnitCategory[])
      .filter((cat) => cat !== 'ejercito')
      .map((cat) =>
        section(
          CATEGORY_NAMES[cat],
          null,
          [
            h(
              'div',
              { class: 'unit-grid' },
              BUYABLE_UNITS.filter((t) => UNITS[t].category === cat).map((type) => {
                const def = UNITS[type];
                return h('div', { class: 'unit-tile', title: def.description }, [
                  h('div', { class: 'unit-tile-top' }, [h('span', { class: 'unit-tile-icon', text: def.icon }), h('span', { class: 'unit-tile-count', text: `×${s.stock[type]}` })]),
                  h('div', { class: 'unit-tile-name', text: def.name }),
                  h('button', {
                    class: 'btn small',
                    text: `+1 · ${money(def.price)}`,
                    disabled: s.treasury < def.price,
                    onClick: () => {
                      if (buyUnit(s, type)) this.change();
                    },
                  }),
                ]);
              }),
            ),
          ],
        ),
      );

    const emergency = s.emergency
      ? h('div', { class: 'cp-alert danger' }, [
          h('strong', { text: '🪖 Estado de Excepción vigente' }),
          h('div', { text: `${s.stock.army} pelotones disponibles hoy en la pestaña «Ejército» de la revuelta.` }),
        ])
      : h('div', {}, [
          effectChips({ intlPressure: EMERGENCY_COST.intlPressure, unrest: EMERGENCY_COST.unrest, popularity: EMERGENCY_COST.popularity }),
          h('button', {
            class: 'btn danger wide',
            text: `🪖 Decretar Estado de Excepción (${EMERGENCY_ARMY_SQUADS} pelotones)`,
            onClick: () => {
              if (declareEmergency(s)) {
                this.handlers.onEmergency();
                this.refresh();
              }
            },
          }),
        ]);

    return [
      h('div', { class: 'cp-tiles three' }, [
        tile('Lealtad militar', `${Math.round(s.loyalty)}%`, bar(s.loyalty, s.loyalty < 30 ? 'bad' : 'good')),
        tile('Efectivos', String(troops)),
        tile('Tesoro', money(s.treasury)),
      ]),
      ...groups,
      section('Estado de Excepción', 'El ejército sale a la calle por un día. Con lealtad baja, los soldados pueden negarse o desertar.', [emergency]),
      ...(['antidisturbios', 'barricadas', 'unidades'] as UpgradeBranch[]).map((branch) =>
        section(
          UPGRADE_BRANCHES[branch],
          branch === 'barricadas' ? 'Niveles: madera → concreto → pinchos.' : null,
          UPGRADE_ORDER.filter((id) => UPGRADES[id].branch === branch).map((id) => this.upgradeRow(id)),
        ),
      ),
    ];
  }

  private upgradeRow(id: UpgradeId): HTMLElement {
    const s = this.state;
    const def = UPGRADES[id];
    const owned = s.upgrades.includes(id);
    const req = def.requires;
    const locked = !owned && req !== undefined && !s.upgrades.includes(req);
    return h('div', { class: `cp-card ${owned ? 'owned' : ''} ${locked ? 'locked' : ''}` }, [
      h('span', { class: 'cp-card-icon', text: def.icon }),
      h('div', { class: 'cp-card-main' }, [
        h('div', { class: 'cp-card-title', text: def.name }),
        h('div', { class: 'cp-card-desc', text: locked && req ? `Requiere «${UPGRADES[req].name}». ${def.description}` : def.description }),
      ]),
      owned
        ? h('span', { class: 'upgrade-owned', text: '✔' })
        : h('button', {
            class: 'btn small',
            text: money(def.price),
            disabled: s.treasury < def.price || locked,
            onClick: () => {
              if (buyUpgrade(s, id)) this.change();
            },
          }),
    ]);
  }

  // ─── Diplomacia ────────────────────────────────────────────────────────

  private diplomacyTab(): Node[] {
    const s = this.state;
    const sanctions = sanctionsFactor(s);
    const st = internationalStatus(s.intlPressure);
    const status = `${st.icon} ${st.name}`;
    const actions = DIPLOMACY.map((a) => {
      const used = s.diplomacyUsed.includes(a.id);
      const blocked = diplomacyBlocked(a, s.intlPressure);
      const tooPoor = (a.effects.treasury ?? 0) < 0 && s.treasury < -(a.effects.treasury ?? 0);
      return h('div', { class: `cp-card ${used ? 'owned' : ''}` }, [
        h('span', { class: 'cp-card-icon', text: a.icon }),
        h('div', { class: 'cp-card-main' }, [
          h('div', { class: 'cp-card-title', text: a.name }),
          h('div', { class: 'cp-card-desc', text: blocked ?? a.description }),
          effectChips(a.effects),
        ]),
        h('button', {
          class: 'btn small',
          text: used ? 'Hecho hoy' : 'Ejecutar',
          disabled: used || blocked !== null || tooPoor,
          onClick: () => {
            if (useDiplomacy(s, a.id)) {
              this.handlers.onDiplomacy(a);
              this.change();
            }
          },
        }),
      ]);
    });
    return [
      h('div', { class: 'cp-tiles' }, [
        tile('Presión internacional', `${Math.round(s.intlPressure)}%`, bar(s.intlPressure, s.intlPressure > 35 ? 'bad' : 'neutral')),
        tile('Estatus', status),
      ]),
      sanctions < 1 ? h('div', { class: 'cp-alert', text: `Las sanciones recortan tus ingresos un ${Math.round((1 - sanctions) * 100)}%.` }) : null,
      section(
        'Presos políticos',
        'Tu moneda de cambio con el exterior. Sin presos, el exterior no tiene nada que pedirte... ni nada que temer. Pero cada día que siguen presos sube la presión.',
        [
          h('div', { class: 'cp-card' }, [
            h('span', { class: 'cp-card-icon', text: '⛓️' }),
            h('div', { class: 'cp-card-main' }, [
              h('div', { class: 'cp-card-title', text: `${s.prisoners} presos` }),
              h('div', { class: 'cp-card-desc', text: s.prisoners > 0 ? `Coste diario: presión +${Math.min(8, s.prisoners * 0.15).toFixed(1)}, molestia +${Math.min(5, s.prisoners * 0.1).toFixed(1)}` : 'Los equipos de captura arrestan líderes durante las revueltas.' }),
            ]),
            h('button', { class: 'btn small', text: 'Liberar…', disabled: s.prisoners <= 0, onClick: () => this.handlers.onRelease() }),
          ]),
        ],
      ),
      section('Acciones diplomáticas', 'Cada acción se puede usar una vez por día.', actions),
    ].filter((n): n is HTMLElement => n !== null);
  }

  dispose(): void {
    this.root.remove();
  }
}

function tile(label: string, value: string, extra?: HTMLElement): HTMLElement {
  return h('div', { class: 'cp-tile' }, [h('div', { class: 'hud-label', text: label }), h('div', { class: 'cp-tile-value', text: value }), extra]);
}

function section(title: string, hint: string | null, children: Node[]): HTMLElement {
  return h('section', { class: 'cp-section' }, [h('h3', { text: title }), hint ? h('div', { class: 'hint', text: hint }) : null, ...children]);
}

function effectChips(e: Effects): HTMLElement {
  const chips: [string, number, boolean][] = [
    ['₱', e.treasury ?? 0, true],
    ['Popularidad', e.popularity ?? 0, true],
    ['Presión', e.intlPressure ?? 0, false],
    ['Lealtad', e.loyalty ?? 0, true],
    ['Molestia', e.unrest ?? 0, false],
  ];
  return h(
    'div',
    { class: 'effect-chips' },
    chips
      .filter(([, v]) => v !== 0)
      .map(([label, v, goodUp]) =>
        h('span', { class: `effect-chip ${v > 0 === goodUp ? 'good' : 'bad'}`, text: label === '₱' ? `${v > 0 ? '+' : ''}${money(v)}` : `${label} ${signed(v)}` }),
      ),
  );
}

function taxMood(rate: number): string {
  if (rate > 0.35) return 'El pueblo echa humo. La popularidad y la molestia empeorarán rápido.';
  if (rate > 0.2) return 'El pueblo refunfuña.';
  if (rate < 0.12) return 'El pueblo te adora... y las arcas lloran.';
  return 'El pueblo lo tolera.';
}
