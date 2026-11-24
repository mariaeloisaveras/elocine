import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CatalogUseCases } from '../../application/catalog.use-cases';
import { MediaItem, PlatformCatalogPage } from '../../domain/media';
import { CatalogPage } from './catalog.page';

function result(page: number): PlatformCatalogPage {
  return {
    id: 'netflix',
    name: 'Netflix',
    total: 3,
    page,
    pages: 3,
    items: [
      {
        id: String(page),
        kind: 'movie',
        title: 'Título ' + page,
        artwork: '',
        backdrop: '',
        category_id: '',
        rating: '',
        year: '',
        synopsis: '',
        duration: 0,
        parent_id: '',
        season: '',
        episode: '',
      } as MediaItem,
    ],
  };
}

describe('Catálogo com rolagem infinita', () => {
  let intersect: () => void;
  const feed = vi.fn();
  beforeEach(() => {
    localStorage.clear();
    feed.mockReset().mockImplementation(async (_id, query) => result(query.page));
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(callback: IntersectionObserverCallback) {
          intersect = () =>
            callback(
              [{ isIntersecting: true } as IntersectionObserverEntry],
              this as unknown as IntersectionObserver,
            );
        }
        observe = vi.fn();
        disconnect = vi.fn();
      },
    );
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'platform/:platform', component: CatalogPage },
          { path: 'browse/:kind', component: CatalogPage },
        ]),
        {
          provide: CatalogUseCases,
          useValue: {
            platformCatalog: feed,
            categories: async () => [],
            search: async () => result(1),
          },
        },
      ],
    });
  });
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('appends pages at the scroll sentinel and stops after the final page', async () => {
    const harness = await RouterTestingHarness.create('/platform/netflix');
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(harness.routeNativeElement!.querySelectorAll('media-card').length).toBe(1);
    intersect();
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(harness.routeNativeElement!.querySelectorAll('media-card').length).toBe(2);
    intersect();
    await harness.fixture.whenStable();
    harness.detectChanges();
    intersect();
    expect(feed.mock.calls.map((call) => call[1].page)).toEqual([1, 2, 3]);
    expect(harness.routeNativeElement!.querySelectorAll('media-card').length).toBe(3);
    expect(harness.routeNativeElement!.textContent).toContain('Você chegou ao fim');
  });

  it('keeps loaded cards on failure and retries the same page without concurrent requests', async () => {
    const harness = await RouterTestingHarness.create('/platform/netflix');
    await harness.fixture.whenStable();
    const page = harness.routeDebugElement!.componentInstance as CatalogPage;
    feed.mockRejectedValueOnce(new Error('Falha temporária'));
    await page.loadMore();
    harness.detectChanges();
    expect(page.items()).toHaveLength(1);
    expect(harness.routeNativeElement!.textContent).toContain('Falha temporária');
    let finish!: (value: PlatformCatalogPage) => void;
    feed.mockReturnValueOnce(
      new Promise<PlatformCatalogPage>((resolve) => {
        finish = resolve;
      }),
    );
    const pending = page.loadMore();
    await page.loadMore();
    expect(feed).toHaveBeenCalledTimes(3);
    finish(result(2));
    await pending;
    expect(page.items()).toHaveLength(2);
    expect(feed.mock.calls.map((call) => call[1].page)).toEqual([1, 2, 2]);
    expect(page.error()).toBe('');
  });

  it('resets the feed for new filters and ignores a late response from the old selection', async () => {
    const harness = await RouterTestingHarness.create('/platform/netflix');
    await harness.fixture.whenStable();
    const page = harness.routeDebugElement!.componentInstance as CatalogPage;
    let finish!: (value: PlatformCatalogPage) => void;
    feed.mockReturnValueOnce(
      new Promise<PlatformCatalogPage>((resolve) => {
        finish = resolve;
      }),
    );
    const pending = page.loadMore();
    await harness.navigateByUrl('/platform/netflix?kind=series&q=teste', CatalogPage);
    await harness.fixture.whenStable();
    finish(result(2));
    await pending;
    expect(page.items().map((item) => item.id)).toEqual(['1']);
    expect(feed.mock.calls.at(-1)![1]).toMatchObject({ kind: 'all', q: 'teste', page: 1 });
    expect(feed.mock.calls[1][2].aborted).toBe(true);
  });
});
