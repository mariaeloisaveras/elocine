import {
  Component,
  DestroyRef,
  ElementRef,
  HostListener,
  afterRenderEffect,
  contentChildren,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { Icon } from './icon';
import { MediaCard } from './media-card';

@Component({
  selector: 'media-carousel',
  standalone: true,
  imports: [Icon],
  templateUrl: './media-carousel.html',
  styleUrl: './media-carousel.css',
})
export class MediaCarousel {
  readonly label = input.required<string>();
  readonly variant = input<'poster' | 'wide' | 'live'>('poster');
  readonly hasMore = input(false);
  readonly loading = input(false);
  readonly endReached = output<void>();
  private pendingForward = false;
  readonly canPrevious = signal(false);
  readonly canNext = signal(false);
  readonly hoverEdge = signal<'previous' | 'next' | null>(null);
  private readonly viewport = viewChild<ElementRef<HTMLElement>>('viewport');
  private readonly cards = contentChildren(MediaCard);
  private readonly destroy = inject(DestroyRef);
  private observer?: ResizeObserver;
  private observed?: HTMLElement;

  constructor() {
    afterRenderEffect({
      read: () => {
        this.cards();
        this.variant();
        this.hasMore();
        this.loading();
        const viewport = this.viewport()?.nativeElement;
        if (viewport && viewport !== this.observed) {
          this.observer?.disconnect();
          this.observed = viewport;
          if (typeof ResizeObserver !== 'undefined') {
            this.observer = new ResizeObserver(() => this.updateBounds());
            this.observer.observe(viewport);
          }
        }
        this.updateBounds();
        if (this.pendingForward && !this.loading()) {
          this.pendingForward = false;
          this.move(1);
        }
      },
    });
    this.destroy.onDestroy(() => this.observer?.disconnect());
  }
  @HostListener('window:resize')
  updateBounds() {
    const viewport = this.viewport()?.nativeElement;
    if (!viewport) return;
    this.canPrevious.set(viewport.scrollLeft > 1);
    this.canNext.set(
      viewport.clientWidth > 0 &&
        (viewport.scrollLeft + viewport.clientWidth < viewport.scrollWidth - 1 || this.hasMore()),
    );
  }
  onPointerMove(event: PointerEvent) {
    if (event.pointerType === 'touch') return;
    const viewport = this.viewport()?.nativeElement;
    if (!viewport) return;
    const bounds = viewport.getBoundingClientRect();
    const cardWidth = viewport.firstElementChild?.getBoundingClientRect().width || bounds.width / 6;
    const position = event.clientX - bounds.left;
    this.hoverEdge.set(
      this.canPrevious() && position <= cardWidth
        ? 'previous'
        : this.canNext() && position >= bounds.width - cardWidth
          ? 'next'
          : null,
    );
  }
  onScroll() {
    this.updateBounds();
    const viewport = this.viewport()?.nativeElement;
    if (
      viewport &&
      viewport.scrollLeft > 0 &&
      viewport.scrollWidth - viewport.scrollLeft - viewport.clientWidth <= viewport.clientWidth
    )
      this.requestMore();
  }
  private requestMore() {
    if (this.hasMore() && !this.loading()) this.endReached.emit();
  }
  scroll(direction: number) {
    if (direction < 0) this.pendingForward = false;
    const viewport = this.viewport()?.nativeElement;
    if (direction > 0 && viewport && this.hasMore()) {
      const remaining = viewport.scrollWidth - viewport.scrollLeft - viewport.clientWidth;
      this.pendingForward = remaining <= 1;
      if (remaining <= viewport.clientWidth) this.requestMore();
    }
    this.move(direction);
  }
  private move(direction: number) {
    const viewport = this.viewport()?.nativeElement;
    if (!viewport) return;
    const cardWidth = viewport.firstElementChild?.getBoundingClientRect().width || 0;
    const gap = Number.parseFloat(getComputedStyle(viewport).columnGap) || 0;
    const step = cardWidth + gap;
    const visibleCards =
      step > 0 ? Math.max(1, Math.floor((viewport.clientWidth + gap) / step)) : 1;
    const distance = step > 0 ? visibleCards * step : viewport.clientWidth;
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    viewport.scrollBy({
      left: direction * distance,
      behavior: reduceMotion ? 'instant' : 'smooth',
    });
  }
}
