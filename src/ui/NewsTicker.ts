import { CHANNELS, type NewsFeed, type NewsItem } from '../news/NewsFeed';
import { h } from './dom';

const PX_PER_SECOND = 90;

/** Franja de noticias en vivo, estilo canal de 24 horas: un titular cruza la pantalla tras otro. */
export class NewsTicker {
  private readonly root: HTMLElement;
  private readonly channel: HTMLElement;
  private readonly track: HTMLElement;
  private readonly text: HTMLElement;
  private readonly clock: HTMLElement;
  private animation: Animation | null = null;
  private readonly unsubscribe: () => void;
  private clockTimer = 0;

  constructor(
    parent: HTMLElement,
    private readonly feed: NewsFeed,
  ) {
    this.channel = h('div', { class: 'ticker-channel' });
    this.text = h('span', { class: 'ticker-text' });
    this.track = h('div', { class: 'ticker-track' }, [this.text]);
    this.clock = h('div', { class: 'ticker-clock' });
    this.root = h('div', { class: 'ticker' }, [h('div', { class: 'ticker-live', text: '● EN VIVO' }), this.channel, this.track, this.clock]);
    parent.append(this.root);
    this.unsubscribe = feed.onBreaking(() => this.showNext());
    this.updateClock();
    this.clockTimer = window.setInterval(() => this.updateClock(), 15000);
    window.requestAnimationFrame(() => this.showNext());
  }

  setMode(mode: 'menu' | 'riot'): void {
    this.root.dataset.mode = mode;
  }

  private updateClock(): void {
    const now = new Date();
    this.clock.textContent = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  }

  private showNext(): void {
    this.render(this.feed.next());
  }

  private render(item: NewsItem): void {
    this.animation?.cancel();
    const channel = CHANNELS[item.source];
    this.root.dataset.source = item.source;
    this.root.classList.toggle('breaking', item.breaking === true);
    this.channel.replaceChildren(
      h('span', { class: 'ticker-name', text: item.breaking ? 'ÚLTIMA HORA' : channel.name }),
      h('span', { class: 'ticker-tag', text: item.breaking ? channel.name : channel.tag }),
    );
    this.text.textContent = item.text;

    const trackWidth = this.track.clientWidth || 800;
    const textWidth = this.text.scrollWidth || item.text.length * 8;
    const distance = trackWidth + textWidth;
    this.animation = this.text.animate(
      [{ transform: `translateX(${trackWidth}px)` }, { transform: `translateX(${-textWidth}px)` }],
      { duration: (distance / PX_PER_SECOND) * 1000, easing: 'linear' },
    );
    this.animation.onfinish = () => this.showNext();
  }

  dispose(): void {
    this.animation?.cancel();
    this.unsubscribe();
    window.clearInterval(this.clockTimer);
    this.root.remove();
  }
}
