import { h } from './dom';

export interface CollapsibleOptions {
  /** Icono que queda a la vista cuando el panel está plegado. */
  icon: string;
  title: string;
  /** Clave para recordar si lo dejaste plegado (por navegador). */
  key: string;
  collapsed?: boolean;
}

const STORAGE_PREFIX = 'mdh-panel:';

function readState(key: string): boolean | null {
  try {
    const v = localStorage.getItem(STORAGE_PREFIX + key);
    return v === null ? null : v === '1';
  } catch {
    return null;
  }
}

function saveState(key: string, collapsed: boolean): void {
  try {
    localStorage.setItem(STORAGE_PREFIX + key, collapsed ? '1' : '0');
  } catch {
    // Sin almacenamiento (modo privado): no pasa nada, solo no se recuerda.
  }
}

/**
 * Añade a un panel un botón para plegarlo: plegado queda solo su icono, para no tapar la vista.
 * Recuerda el estado entre partidas.
 */
export function collapsible(panel: HTMLElement, opts: CollapsibleOptions): void {
  const toggle = h('button', { class: 'panel-toggle' });
  let collapsed = readState(opts.key) ?? opts.collapsed ?? false;
  const apply = (): void => {
    panel.classList.toggle('collapsed', collapsed);
    toggle.textContent = collapsed ? opts.icon : '—';
    toggle.title = collapsed ? `Mostrar: ${opts.title}` : `Plegar: ${opts.title}`;
  };
  toggle.addEventListener('pointerdown', (e) => e.stopPropagation());
  toggle.addEventListener('click', (e) => {
    e.stopPropagation();
    collapsed = !collapsed;
    saveState(opts.key, collapsed);
    apply();
  });
  panel.classList.add('collapsible');
  panel.prepend(toggle);
  apply();
}
