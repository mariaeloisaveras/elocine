import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';
import { MediaItem } from '../../domain/media';
import { MediaCarousel } from './media-carousel';
import { MediaCard } from './media-card';

@Component({
  standalone: true,
  imports: [MediaCarousel, MediaCard],
  template:
    '<media-carousel label="Filmes" [hasMore]="hasMore()" [loading]="loading()" (endReached)="requests=requests+1">@for(item of items;track item.id){<media-card [item]="item" />}</media-carousel>',
})
class CarouselHost {
  hasMore = signal(false);
  loading = signal(false);
  requests = 0;
  readonly items = Array.from(
    { length: 8 },
    (_, index) =>
      ({
        id: String(index),
        kind: 'movie',
        title: 'Filme ' + index,
        artwork: '',
        backdrop: '',
        category_id: '',
        rating: '',
        year: '',
        synopsis: '',
        duration: 100,
        parent_id: '',
        season: '',
        episode: '',
      }) as MediaItem,
  );
}
async function create() {
  TestBed.configureTestingModule({ providers: [provideRouter([])] });
  const fixture = TestBed.createComponent(CarouselHost);
  fixture.detectChanges();
  await fixture.whenStable();
  const carousel = fixture.debugElement.query(By.directive(MediaCarousel))
    .componentInstance as MediaCarousel;
  const viewport = fixture.nativeElement.querySelector('.carousel-viewport') as HTMLElement;
  let extent = 1200;
  Object.defineProperties(viewport, {
    clientWidth: { configurable: true, get: () => 600 },
    scrollWidth: { configurable: true, get: () => extent },
  });
  vi.spyOn(viewport, 'getBoundingClientRect').mockReturnValue(new DOMRect(100, 0, 600, 180));
  vi.spyOn(viewport.firstElementChild!, 'getBoundingClientRect').mockReturnValue(
    new DOMRect(100, 0, 100, 150),
  );
  viewport.scrollBy = vi.fn();
  carousel.updateBounds();
  fixture.detectChanges();
  return {
    fixture,
    carousel,
    viewport,
    setExtent(value: number) {
      extent = value;
      carousel.updateBounds();
      fixture.detectChanges();
    },
  };
}
describe('Setas dos carrosséis', () => {
  it('shows an edge arrow on the last visible card and hides it when the mouse leaves', async () => {
    const { fixture } = await create();
    const root = fixture.nativeElement.querySelector('.carousel') as HTMLElement;
    expect(fixture.nativeElement.querySelector('.previous')).toBeNull();
    expect(fixture.nativeElement.querySelector('.next')).toBeTruthy();
    root.dispatchEvent(new MouseEvent('pointermove', { clientX: 400, bubbles: true }));
    fixture.detectChanges();
    expect(root.classList.contains('show-next')).toBe(false);
    root.dispatchEvent(new MouseEvent('pointermove', { clientX: 650, bubbles: true }));
    fixture.detectChanges();
    expect(root.classList.contains('show-next')).toBe(true);
    root.dispatchEvent(new Event('pointerleave'));
    fixture.detectChanges();
    expect(root.classList.contains('show-next')).toBe(false);
  });
  it('scrolls a group of cards and only offers directions with remaining content', async () => {
    const { fixture, viewport } = await create();
    fixture.nativeElement.querySelector('.next').click();
    expect(viewport.scrollBy).toHaveBeenCalledWith(
      expect.objectContaining({ left: expect.any(Number), behavior: 'smooth' }),
    );
    const distance = vi.mocked(viewport.scrollBy).mock.calls[0][0] as ScrollToOptions;
    expect(distance.left).toBeGreaterThan(100);
    viewport.scrollLeft = 600;
    viewport.dispatchEvent(new Event('scroll'));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.next')).toBeNull();
    expect(fixture.nativeElement.querySelector('.previous')).toBeTruthy();
    fixture.nativeElement.querySelector('.previous').click();
    const back = vi.mocked(viewport.scrollBy).mock.calls.at(-1)![0] as ScrollToOptions;
    expect(back.left).toBeLessThan(0);
  });
  it('requests another page at the loaded edge and retains the arrow until the catalog ends', async () => {
    const { fixture, viewport, carousel } = await create();
    fixture.componentInstance.hasMore.set(true);
    fixture.detectChanges();
    viewport.scrollLeft = 600;
    carousel.onScroll();
    expect(fixture.componentInstance.requests).toBe(1);
    fixture.componentInstance.loading.set(true);
    fixture.detectChanges();
    carousel.onScroll();
    expect(fixture.componentInstance.requests).toBe(1);
    expect(fixture.nativeElement.querySelector('.next')).toBeTruthy();
    fixture.componentInstance.loading.set(false);
    fixture.componentInstance.hasMore.set(false);
    fixture.detectChanges();
    carousel.updateBounds();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.next')).toBeNull();
  });
  it('does not show arrows when all cards already fit', async () => {
    const { fixture, setExtent } = await create();
    setExtent(600);
    expect(fixture.nativeElement.querySelector('.edge-arrow')).toBeNull();
  });
});
