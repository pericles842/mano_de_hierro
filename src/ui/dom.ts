import { COUNTRY } from '../data/country';

type Child = Node | string | null | undefined | false;

interface Props {
  class?: string;
  text?: string;
  title?: string;
  style?: string;
  disabled?: boolean;
  onClick?: (e: Event) => void;
  attrs?: Record<string, string>;
}

/** Crea un elemento DOM de forma declarativa (sin innerHTML: sin riesgo de inyección). */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Props = {},
  children: Child[] = [],
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (props.class) el.className = props.class;
  if (props.text !== undefined) el.textContent = props.text;
  if (props.title) el.title = props.title;
  if (props.style) el.setAttribute('style', props.style);
  if (props.disabled && el instanceof HTMLButtonElement) el.disabled = true;
  if (props.onClick) el.addEventListener('click', props.onClick);
  if (props.attrs) for (const [k, v] of Object.entries(props.attrs)) el.setAttribute(k, v);
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child);
  }
  return el;
}

export function money(n: number): string {
  const sign = n < 0 ? '-' : '';
  return `${sign}${COUNTRY.currencySymbol}${Math.abs(Math.round(n)).toLocaleString('es-ES')}`;
}

export function signed(n: number, suffix = ''): string {
  const r = Math.round(n);
  return `${r > 0 ? '+' : ''}${r}${suffix}`;
}

export function bar(value: number, tone: 'good' | 'bad' | 'neutral'): HTMLElement {
  const fill = h('div', { class: `bar-fill ${tone}`, style: `width:${Math.max(0, Math.min(100, value))}%` });
  return h('div', { class: 'bar' }, [fill]);
}
