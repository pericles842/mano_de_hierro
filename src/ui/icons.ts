/**
 * Iconos de la interfaz en SVG (trazo, heredan el color del texto).
 * Se ven igual en todos los sistemas, a diferencia de los emojis.
 */
const PATHS = {
  /** Cuatro flechas: mover. */
  move: '<path d="M12 2v20M2 12h20"/><path d="M9 5l3-3 3 3M9 19l3 3 3-3M5 9l-3 3 3 3M19 9l3 3-3 3"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6"/><path d="M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  rotate: '<path d="M20 12a8 8 0 1 1-2.34-5.66"/><path d="M20 4v5h-5"/>',
  play: '<path d="M7 4l13 8-13 8z" fill="currentColor"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  sound: '<path d="M4 9v6h4l5 4V5L8 9z" fill="currentColor"/><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11"/>',
  mute: '<path d="M4 9v6h4l5 4V5L8 9z" fill="currentColor"/><path d="M17 9l5 6M22 9l-5 6"/>',
  wrench: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.2L3 17.8 6.2 21l6.3-6.3a4 4 0 0 0 5.2-5.4l-2.5 2.5-2.6-.6-.6-2.6z"/>',
  check: '<path d="M4 12l5 5L20 6"/>',
  mouse: '<rect x="6" y="3" width="12" height="18" rx="6"/><path d="M12 7v4"/>',
} as const;

export type IconName = keyof typeof PATHS;

/** Crea un icono SVG. `size` en píxeles. */
export function icon(name: IconName, size = 16): SVGSVGElement {
  const wrap = document.createElement('span');
  wrap.innerHTML =
    `<svg class="icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" ` +
    `stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${PATHS[name]}</svg>`;
  return wrap.firstElementChild as SVGSVGElement;
}

/** Reemplaza el contenido de un elemento por un icono (y un texto opcional). */
export function setIcon(el: HTMLElement, name: IconName, label = '', size = 16): void {
  el.replaceChildren(icon(name, size));
  if (label) el.append(document.createTextNode(label));
}
