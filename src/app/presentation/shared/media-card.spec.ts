import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';
import { MediaItem } from '../../domain/media';
import { CatalogUseCases } from '../../application/catalog.use-cases';
import { MediaCard } from './media-card';

describe('MediaCard preview', () => {
  it('opens immediately on hover and removes the trailer when closed', async () => {
    vi.useFakeTimers();
    const item = { id: '1', kind: 'movie', title: 'Filme', artwork: '', synopsis: '' } as MediaItem;
    const details = vi.fn().mockResolvedValue({
      item: { ...item, synopsis: 'Uma aventura.', trailer: 'https://youtu.be/abcdefghijk' },
      episodes: [],
    });
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: CatalogUseCases, useValue: { details } }],
    });
    const fixture = TestBed.createComponent(MediaCard);
    fixture.componentRef.setInput('item', item);
    fixture.detectChanges();
    const panel = fixture.nativeElement.querySelector('.media-preview') as HTMLElement;
    panel.showPopover = vi.fn();
    panel.hidePopover = vi.fn();
    try {
      fixture.componentInstance.enter({ pointerType: 'mouse' } as PointerEvent);
      expect(panel.showPopover).toHaveBeenCalledOnce();
      expect(fixture.componentInstance.opened()).toBe(true);
      await vi.advanceTimersByTimeAsync(0);
      fixture.detectChanges();
      expect(details).toHaveBeenCalledWith('movie', '1', expect.any(AbortSignal));
      expect(panel.textContent).toContain('Uma aventura.');
      expect(panel.querySelector('iframe')?.src).toContain(
        'youtube-nocookie.com/embed/abcdefghijk',
      );
      fixture.componentInstance.close();
      fixture.detectChanges();
      expect(panel.querySelector('iframe')).toBeNull();
    } finally {
      fixture.destroy();
      vi.useRealTimers();
    }
  });

  it('keeps the title image inside the modal when no trailer is available', () => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(MediaCard);
    fixture.componentRef.setInput('item', {
      id: '3',
      kind: 'movie',
      title: 'Sem trailer',
      artwork: '/poster.jpg',
      backdrop: '/backdrop.jpg',
    } as MediaItem);
    fixture.detectChanges();
    const panel = fixture.nativeElement.querySelector('.media-preview') as HTMLElement;
    panel.showPopover = vi.fn();
    panel.hidePopover = vi.fn();
    fixture.componentInstance.enter({ pointerType: 'mouse' } as PointerEvent);
    fixture.detectChanges();
    expect(panel.querySelector('iframe')).toBeNull();
    expect(panel.querySelector('img')?.getAttribute('src')).toBe('/backdrop.jpg');
    fixture.componentInstance.close();
    fixture.destroy();
  });

  it('shows series seasons and links each episode to playback', async () => {
    const item = { id: 'series-1', kind: 'series', title: 'Série', artwork: '' } as MediaItem;
    const episode = (id: string, season: string, number: string) =>
      ({
        ...item,
        id,
        kind: 'episode',
        parent_id: item.id,
        season,
        episode: number,
        title: 'Episódio ' + id,
        duration: 1200,
      }) as MediaItem;
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: CatalogUseCases,
          useValue: {
            details: vi.fn().mockResolvedValue({
              item,
              episodes: [episode('b', '2', '1'), episode('a', '1', '1')],
            }),
          },
        },
      ],
    });
    const fixture = TestBed.createComponent(MediaCard);
    fixture.componentRef.setInput('item', item);
    fixture.detectChanges();
    const panel = fixture.nativeElement.querySelector('.media-preview') as HTMLElement;
    panel.showPopover = vi.fn();
    panel.hidePopover = vi.fn();
    fixture.componentInstance.enter({ pointerType: 'mouse' } as PointerEvent);
    await fixture.whenStable();
    fixture.detectChanges();
    expect(panel.classList.contains('series-preview')).toBe(true);
    expect(fixture.componentInstance.seasons()).toEqual(['1', '2']);
    expect(panel.querySelector('.preview-episode')?.getAttribute('href')).toBe(
      '/watch/series/series-1?episode=a',
    );
    const select = panel.querySelector('select')!;
    select.value = '2';
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(panel.querySelector('.preview-episode')?.getAttribute('href')).toBe(
      '/watch/series/series-1?episode=b',
    );
    fixture.componentInstance.close();
    fixture.destroy();
  });

  it('does not embed untrusted trailer URLs', () => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(MediaCard);
    fixture.componentRef.setInput('item', {
      id: '2',
      kind: 'movie',
      title: 'Filme',
      trailer: 'https://example.com/video',
    } as MediaItem);
    expect(fixture.componentInstance.trailerUrl()).toBeNull();
    fixture.destroy();
  });
});
