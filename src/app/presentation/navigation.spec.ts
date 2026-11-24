import { By } from '@angular/platform-browser';
import { PlatformCarousel } from './home/platform-carousel';
import { MediaCarousel } from './shared/media-carousel';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CatalogUseCases } from '../application/catalog.use-cases';
import { PlaybackUseCases } from '../application/playback.use-cases';
import { CatalogKind, MediaItem, Playback } from '../domain/media';
import { CatalogPage } from './catalog/catalog.page';
import { HomePage } from './home/home.page';
import { WatchPage } from './watch/watch.page';
import { LibraryStore } from '../infrastructure/library.store';

function item(kind: CatalogKind = 'movie'): MediaItem {
  return {
    id: '1',
    kind,
    title: 'Além do horizonte',
    artwork: '',
    backdrop: '',
    category_id: '1',
    rating: '8',
    year: '2026',
    synopsis: 'Uma história.',
    duration: 3600,
    parent_id: '',
    season: '',
    episode: '',
  };
}
describe('Catálogo e reprodução', () => {
  const release = vi.fn(),
    stop = vi.fn().mockResolvedValue(undefined);
  beforeEach(() => {
    localStorage.clear();
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    release.mockClear();
    stop.mockClear();
    vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: '', component: HomePage },
          { path: 'platform/:platform', component: CatalogPage },
          { path: 'browse/:kind', component: CatalogPage },
          { path: 'watch/:kind/:id', component: WatchPage },
        ]),
        {
          provide: CatalogUseCases,
          useValue: {
            account: async () => ({
              status: 'Active',
              connections: 0,
              max_connections: 1,
              compatibility_available: true,
              demo: true,
            }),
            categories: async () => [],
            platforms: async () => [],
            platformCatalog: async () => ({
              id: 'netflix',
              name: 'Netflix',
              items: [item(), item('series')],
              total: 2,
              page: 1,
              pages: 1,
            }),
            home: async () =>
              (['movie', 'series', 'live'] as CatalogKind[]).map((kind) => ({
                kind,
                page: { items: [item(kind)], total: 1, page: 1, pages: 1 },
              })),
            search: async (query: { kind: CatalogKind }) => ({
              items: [item(query.kind)],
              total: 1,
              page: 1,
              pages: 1,
            }),
            details: async (kind: CatalogKind) => ({ item: item(kind), episodes: [] }),
          },
        },
        {
          provide: PlaybackUseCases,
          useValue: {
            start: async (media: MediaItem) =>
              ({
                id: 'playback',
                media_url: 'http://127.0.0.1/media/token/compat.mp4',
                item: media,
                compatibility: true,
                prefetch: true,
                is_hls: false,
                can_seek: true,
                offset: 0,
              }) as Playback,
            progress: async () => ({ size: 0, total: null, done: false, error: null, offset: 0 }),
            seek: vi.fn(),
            stop,
            release,
          },
        },
      ],
    });
  });
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
  });
  it('opens a title on its own route, then releases playback and restores catalog filters', async () => {
    const harness = await RouterTestingHarness.create('/?kind=movie&q=horizonte');
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(harness.routeNativeElement?.textContent).toContain('Além do horizonte');
    const link = harness.routeNativeElement?.querySelector('media-card a') as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('/watch/movie/1');
    const watch = await harness.navigateByUrl('/watch/movie/1', WatchPage);
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(watch.session()?.item.title).toBe('Além do horizonte');
    expect(harness.routeNativeElement?.querySelector('video')).toBeTruthy();
    await watch.back();
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(stop).toHaveBeenCalledWith('playback');
    expect(TestBed.inject(Router).url).toBe('/?kind=movie&q=horizonte');
    expect(
      harness.routeNativeElement?.querySelector('.search-box input')?.getAttribute('placeholder'),
    ).toBe('O que você quer assistir?');
  });
  it('shows available title credits and hides missing fields', async () => {
    const details = vi.spyOn(TestBed.inject(CatalogUseCases), 'details').mockResolvedValue({
      item: {
        ...item(),
        cast: 'Atriz A, Ator B',
        director: 'Diretora',
        genre: 'Drama',
        country: 'Brasil',
      },
      episodes: [],
    });
    const harness = await RouterTestingHarness.create('/watch/movie/1');
    await harness.fixture.whenStable();
    harness.detectChanges();
    const credits = harness.routeNativeElement!.querySelector('.title-credits')!;
    expect(Array.from(credits.querySelectorAll('dd')).map((node) => node.textContent)).toEqual([
      'Atriz A, Ator B',
      'Diretora',
      'Drama',
      'Brasil',
    ]);
    details.mockResolvedValueOnce({ item: { ...item(), id: '2', genre: 'Comédia' }, episodes: [] });
    await harness.navigateByUrl('/watch/movie/2', WatchPage);
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(harness.routeNativeElement!.querySelectorAll('.title-credits dt')).toHaveLength(1);
    expect(harness.routeNativeElement!.querySelector('.title-credits dt')!.textContent).toBe(
      'Gêneros',
    );
    details.mockResolvedValueOnce({ item: { ...item(), id: '3' }, episodes: [] });
    await harness.navigateByUrl('/watch/movie/3', WatchPage);
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(harness.routeNativeElement!.querySelector('.title-credits')).toBeNull();
  });
  it('selects series episodes and changes seasons without creating a second page', async () => {
    const series = item('series');
    const first = {
      ...item(),
      kind: 'episode',
      id: '101',
      parent_id: '1',
      season: '1',
      episode: '1',
    } as MediaItem;
    const second = { ...first, id: '102', season: '2', episode: '1' };
    vi.spyOn(TestBed.inject(CatalogUseCases), 'details').mockResolvedValue({
      item: series,
      episodes: [first, second],
    });
    const harness = await RouterTestingHarness.create();
    const watch = await harness.navigateByUrl('/watch/series/1', WatchPage);
    await harness.fixture.whenStable();
    expect(watch.selected()?.id).toBe('101');
    expect(watch.next()?.id).toBe('102');
    await watch.chooseEpisode(second);
    await harness.fixture.whenStable();
    expect(watch.selected()?.id).toBe('102');
    expect(watch.season()).toBe('2');
    expect(watch.session()?.item.id).toBe('102');
    expect(release).toHaveBeenCalledWith('playback');
  });
  it('adds platform carousels and preserves the platform when opening all titles', async () => {
    const catalog = TestBed.inject(CatalogUseCases);
    vi.spyOn(catalog, 'platforms').mockResolvedValue([
      { id: 'netflix', name: 'Netflix', items: [item(), item('series')], total: 2 },
    ]);
    const feed = vi.spyOn(catalog, 'platformCatalog');
    const harness = await RouterTestingHarness.create('/');
    await harness.fixture.whenStable();
    harness.detectChanges();
    const platform = harness.routeNativeElement!.querySelector('[data-platform="netflix"]');
    expect(platform).toBeTruthy();
    expect(platform!.querySelectorAll('media-card').length).toBe(2);
    expect(
      platform!
        .querySelector('a[aria-label="Ver todos os títulos de Netflix"]')
        ?.getAttribute('href'),
    ).toBe('/platform/netflix');
    expect(harness.routeNativeElement!.textContent).toContain('Novidades que merecem o seu play');
    await harness.navigateByUrl('/platform/netflix', CatalogPage);
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(feed).toHaveBeenCalledTimes(1);
    expect(harness.routeNativeElement!.querySelectorAll('.all-titles-grid media-card').length).toBe(
      2,
    );
    expect(harness.routeNativeElement!.querySelector('.hero')).toBeNull();
    const watch = await harness.navigateByUrl('/watch/movie/1', WatchPage);
    await harness.fixture.whenStable();
    await watch.back();
    await harness.fixture.whenStable();
    expect(TestBed.inject(Router).url).toBe('/platform/netflix');
    expect(feed).toHaveBeenCalledTimes(1);
    expect(harness.routeNativeElement!.querySelectorAll('.all-titles-grid media-card').length).toBe(
      2,
    );
  });
  it('loads the rest of a platform carousel without replacing its initial cards', async () => {
    const catalog = TestBed.inject(CatalogUseCases);
    vi.spyOn(catalog, 'platforms').mockResolvedValue([
      { id: 'netflix', name: 'Netflix', items: [item(), item('series')], total: 4 },
    ]);
    const feed = vi.spyOn(catalog, 'platformCatalog').mockResolvedValue({
      id: 'netflix',
      name: 'Netflix',
      items: [
        { ...item(), id: '2' },
        { ...item('series'), id: '2' },
      ],
      total: 4,
      page: 2,
      pages: 2,
    });
    const harness = await RouterTestingHarness.create('/');
    await harness.fixture.whenStable();
    harness.detectChanges();
    const platform = harness.routeDebugElement!.query(By.directive(PlatformCarousel));
    platform.query(By.directive(MediaCarousel)).componentInstance.endReached.emit();
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(platform.nativeElement.querySelectorAll('media-card')).toHaveLength(4);
    expect(feed.mock.calls[0].slice(0, 2)).toEqual(['netflix', { page: 2, limit: 2 }]);
    const component = platform.componentInstance as PlatformCarousel;
    expect(component.hasMore()).toBe(false);
    await component.loadMore();
    expect(feed).toHaveBeenCalledTimes(1);
  });
  it('appends general carousel pages, retries failures and stops at the last page', async () => {
    const catalog = TestBed.inject(CatalogUseCases);
    vi.spyOn(catalog, 'home').mockResolvedValue([
      { kind: 'movie', page: { items: [item()], page: 1, pages: 2, total: 2 } },
    ]);
    const search = vi.spyOn(catalog, 'search').mockRejectedValueOnce(new Error('Falha temporária'));
    const harness = await RouterTestingHarness.create('/');
    await harness.fixture.whenStable();
    const home = harness.routeDebugElement!.componentInstance as HomePage;
    await home.loadMoreRail('movie');
    expect(home.rails()[0].page.items).toHaveLength(1);
    expect(home.railErrors().movie).toBe('Falha temporária');
    search.mockResolvedValueOnce({ items: [{ ...item(), id: '2' }], page: 2, pages: 2, total: 2 });
    await Promise.all([home.loadMoreRail('movie'), home.loadMoreRail('movie')]);
    expect(home.rails()[0].page.items.map((entry) => entry.id)).toEqual(['1', '2']);
    expect(search.mock.calls.map(([query]) => query.page)).toEqual([2, 2]);
    await home.loadMoreRail('movie');
    expect(search).toHaveBeenCalledTimes(2);
  });
  it('keeps the existing catalog available if platform grouping fails', async () => {
    vi.spyOn(TestBed.inject(CatalogUseCases), 'platforms').mockRejectedValue(
      new Error('Unavailable'),
    );
    const harness = await RouterTestingHarness.create('/');
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(harness.routeNativeElement!.textContent).toContain('Novidades que merecem o seu play');
    expect(harness.routeNativeElement!.textContent).toContain(
      'Não foi possível organizar os títulos por plataforma.',
    );
    expect(harness.routeNativeElement!.querySelector('platform-carousel')).toBeNull();
  });
  it('does not let a delayed seek overwrite a newer playback', async () => {
    const harness = await RouterTestingHarness.create();
    const watch = await harness.navigateByUrl('/watch/movie/1', WatchPage);
    await harness.fixture.whenStable();
    const old = watch.session()!;
    let complete!: (value: Playback) => void;
    vi.spyOn(TestBed.inject(PlaybackUseCases), 'seek').mockReturnValue(
      new Promise<Playback>((resolve) => (complete = resolve)),
    );
    const seek = watch.seek({ seconds: 1800, resume: true });
    await watch.start({ ...item(), id: '2' });
    complete({ ...old, offset: 1800 });
    await seek;
    expect(watch.session()?.item.id).toBe('2');
    expect(watch.session()?.offset).toBe(0);
  });
  it('automatically plays the next episode, crosses seasons and stops at the end of the series', async () => {
    const series = item('series');
    const first = {
      ...item(),
      kind: 'episode',
      id: '101',
      parent_id: '1',
      season: '1',
      episode: '1',
    } as MediaItem;
    const second = { ...first, id: '102', episode: '2' },
      third = { ...first, id: '201', season: '2', episode: '1' };
    vi.spyOn(TestBed.inject(CatalogUseCases), 'details').mockResolvedValue({
      item: series,
      episodes: [first, second, third],
    });
    const start = vi.spyOn(TestBed.inject(PlaybackUseCases), 'start');
    const harness = await RouterTestingHarness.create();
    const watch = await harness.navigateByUrl('/watch/series/1', WatchPage);
    await harness.fixture.whenStable();
    harness.detectChanges();
    const originalPlayer = harness.routeNativeElement!.querySelector('.cinema-player');
    const finish = async () => {
      harness.routeNativeElement!.querySelector('video')!.dispatchEvent(new Event('ended'));
      await harness.fixture.whenStable();
      harness.detectChanges();
    };
    watch.onPosition({ position: 120, duration: 3600 });
    await finish();
    expect(watch.selected()?.id).toBe('102');
    expect(watch.autoplay()).toBe(true);
    expect(harness.routeNativeElement!.querySelector('.cinema-player')).toBe(originalPlayer);
    expect(start.mock.calls.at(-1)?.slice(0, 3)).toEqual([second, true, 0]);
    await finish();
    expect(watch.selected()?.id).toBe('201');
    expect(watch.season()).toBe('2');
    expect(start.mock.calls.at(-1)?.slice(0, 3)).toEqual([third, true, 0]);
    watch.onPosition({ position: 120, duration: 3600 });
    const count = start.mock.calls.length;
    await finish();
    expect(start.mock.calls.length).toBe(count);
    expect(watch.selected()?.id).toBe('201');
    await harness.navigateByUrl('/');
    expect(TestBed.inject(LibraryStore).resume(series)).toBeUndefined();
  });
  it('does not auto-advance at the episode end after mouse cancellation, but allows a manual click', async () => {
    const first = {
      ...item(),
      kind: 'episode',
      id: '101',
      parent_id: '1',
      season: '1',
      episode: '1',
    } as MediaItem;
    const second = { ...first, id: '102', episode: '2' };
    vi.spyOn(TestBed.inject(CatalogUseCases), 'details').mockResolvedValue({
      item: item('series'),
      episodes: [first, second],
    });
    const harness = await RouterTestingHarness.create();
    const watch = await harness.navigateByUrl('/watch/series/1', WatchPage);
    await harness.fixture.whenStable();
    watch.cancelAutomaticNext();
    await watch.onEnded();
    expect(watch.selected()?.id).toBe('101');
    await watch.playNext();
    await harness.fixture.whenStable();
    expect(watch.selected()?.id).toBe('102');
  });
});
