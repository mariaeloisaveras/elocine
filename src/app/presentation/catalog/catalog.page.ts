import {
  Component,
  DestroyRef,
  HostListener,
  OnDestroy,
  afterRenderEffect,
  computed,
  inject,
  signal,
  viewChild,
  ElementRef,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, ParamMap, Router, RouterLink } from '@angular/router';
import { Title } from '@angular/platform-browser';
import { combineLatest } from 'rxjs';
import { CatalogUseCases } from '../../application/catalog.use-cases';
import { CatalogKind, CatalogPage as CatalogResult, Category, MediaItem } from '../../domain/media';
import { CatalogMemoryStore } from '../../infrastructure/catalog-memory.store';
import { LibraryStore } from '../../infrastructure/library.store';
import { Icon } from '../shared/icon';
import { MediaCard } from '../shared/media-card';
import { platformBrand } from '../shared/platform-brand';

type FeedKind = CatalogKind | 'all';
const LABELS: Record<CatalogKind, string> = { movie: 'Filmes', series: 'Séries', live: 'Ao vivo' };
const PAGE_SIZE = 30;
const PREFETCH_DISTANCE = 600;

@Component({
  standalone: true,
  imports: [RouterLink, Icon, MediaCard],
  templateUrl: './catalog.page.html',
  styleUrl: './catalog.page.css',
})
export class CatalogPage implements OnDestroy {
  private readonly catalog = inject(CatalogUseCases);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly destroy = inject(DestroyRef);
  private readonly titleService = inject(Title);
  private readonly memory = inject(CatalogMemoryStore);
  private readonly library = inject(LibraryStore);
  private readonly sentinel = viewChild<ElementRef<HTMLElement>>('sentinel');
  readonly items = signal<MediaItem[]>([]);
  readonly title = signal('Catálogo');
  readonly total = signal(0);
  readonly page = signal(0);
  readonly pages = signal(1);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly platformId = signal('');
  readonly kind = signal<FeedKind>('all');
  readonly query = signal('');
  readonly category = signal('');
  readonly categories = signal<Category[]>([]);
  readonly hasMore = computed(() => this.page() < this.pages());
  readonly isPlatform = computed(() => !!this.platformId());
  readonly brand = computed(() => platformBrand(this.platformId()));
  readonly skeletons = Array.from({ length: 18 }, (_, index) => index);
  readonly automaticScroll = typeof IntersectionObserver !== 'undefined';
  private readonly observer = this.automaticScroll
    ? new IntersectionObserver(
        (entries) => {
          if (entries.some((entry) => entry.isIntersecting)) void this.loadMore();
        },
        { rootMargin: PREFETCH_DISTANCE + 'px 0px' },
      )
    : null;
  private abort?: AbortController;
  private debounce?: ReturnType<typeof setTimeout>;
  private generation = 0;
  private activeUrl = '';
  private destroyed = false;
  private restoreFrame?: number;

  constructor() {
    combineLatest([this.route.paramMap, this.route.queryParamMap])
      .pipe(takeUntilDestroyed(this.destroy))
      .subscribe(([params, query]) => this.configure(params, query));
    afterRenderEffect({
      read: () => {
        const sentinel = this.sentinel()?.nativeElement;
        const observe =
          sentinel && !this.loading() && !this.error() && this.hasMore() && this.items().length > 0;
        this.observer?.disconnect();
        if (observe) this.observer?.observe(sentinel);
      },
    });
  }
  private configure(params: ParamMap, query: ParamMap) {
    const platform = params.get('platform') || '';
    const pathKind = params.get('kind');
    const path = platform ? ['/platform', platform] : ['/browse', pathKind];
    const queryParams = Object.fromEntries(query.keys.map((key) => [key, query.get(key)]));
    const url = this.router.serializeUrl(this.router.createUrlTree(path, { queryParams }));
    if (url === this.activeUrl) return;
    this.saveSnapshot();
    this.abort?.abort();
    this.abort = new AbortController();
    this.generation++;
    this.activeUrl = url;
    this.library.lastCatalogUrl = url;
    this.platformId.set(platform);
    this.query.set(query.get('q') || '');
    this.category.set(query.get('category') || '');
    const kind = platform ? 'all' : pathKind;
    if (
      !['all', 'movie', 'series', 'live'].includes(kind || '') ||
      (!platform && kind === 'all') ||
      (platform && kind === 'live')
    ) {
      this.items.set([]);
      this.pages.set(0);
      this.loading.set(false);
      this.error.set('Esta seleção de catálogo não está disponível.');
      return;
    }
    this.kind.set(kind as FeedKind);
    this.categories.set([]);
    this.error.set('');
    this.loading.set(false);
    const saved = this.memory.get(url);
    this.items.set(saved?.items || []);
    this.title.set(saved?.title || (platform ? 'Plataforma' : LABELS[kind as CatalogKind]));
    this.total.set(saved?.total || 0);
    this.page.set(saved?.page || 0);
    this.pages.set(saved?.pages || 1);
    this.titleService.setTitle(this.title() + ' — Elocine');
    if (!platform) void this.loadCategories(kind as CatalogKind, this.abort.signal);
    if (saved) this.restoreScroll(saved.scrollY, url);
    else void this.loadMore();
  }
  private async loadCategories(kind: CatalogKind, signal: AbortSignal) {
    try {
      const categories = await this.catalog.categories(kind, signal);
      if (!signal.aborted) this.categories.set(categories);
    } catch {}
  }
  async loadMore() {
    if (this.destroyed || this.loading() || !this.hasMore()) return;
    const generation = this.generation;
    const nextPage = this.page() + 1;
    const signal = this.abort?.signal;
    this.loading.set(true);
    this.error.set('');
    try {
      let result: CatalogResult;
      if (this.platformId()) {
        const platform = await this.catalog.platformCatalog(
          this.platformId(),
          {
            kind: this.kind() as 'all' | 'movie' | 'series',
            q: this.query(),
            page: nextPage,
            limit: PAGE_SIZE,
          },
          signal,
        );
        if (generation !== this.generation || signal?.aborted) return;
        this.title.set(platform.name);
        result = platform;
      } else
        result = await this.catalog.search(
          {
            kind: this.kind() as CatalogKind,
            q: this.query(),
            category: this.category(),
            page: nextPage,
            limit: PAGE_SIZE,
          },
          signal,
        );
      if (generation !== this.generation || signal?.aborted) return;
      const existing = new Set(this.items().map((item) => item.kind + ':' + item.id));
      const fresh = result.items.filter((item) => {
        const key = item.kind + ':' + item.id;
        if (existing.has(key)) return false;
        existing.add(key);
        return true;
      });
      this.items.update((items) => [...items, ...fresh]);
      this.total.set(result.total);
      this.page.set(result.page);
      this.pages.set(result.pages);
      this.titleService.setTitle(this.title() + ' — Elocine');
    } catch (error) {
      if (generation === this.generation && !signal?.aborted)
        this.error.set((error as Error).message);
    } finally {
      if (generation === this.generation) this.loading.set(false);
    }
  }
  search(event: Event) {
    const q = (event.target as HTMLInputElement).value;
    clearTimeout(this.debounce);
    this.debounce = setTimeout(() => this.filters({ q: q || null }), 350);
  }
  selectCategory(event: Event) {
    const changes: Record<string, string | null> = {
      category: (event.target as HTMLSelectElement).value || null,
    };
    if (this.kind() === 'live') {
      clearTimeout(this.debounce);
      this.query.set('');
      changes['q'] = null;
    }
    this.filters(changes);
  }
  clearFilters() {
    this.filters({ q: null, category: null, kind: null });
  }
  private filters(changes: Record<string, string | null>) {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: changes,
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
    window.scrollTo({ top: 0, behavior: 'instant' });
  }
  @HostListener('window:scroll') onScroll() {
    if (this.observer || this.loading() || this.error()) return;
    const sentinel = this.sentinel()?.nativeElement;
    if (sentinel && sentinel.getBoundingClientRect().top <= window.innerHeight + PREFETCH_DISTANCE)
      void this.loadMore();
  }
  private saveSnapshot() {
    if (!this.activeUrl || this.page() === 0) return;
    this.memory.save(this.activeUrl, {
      items: this.items(),
      title: this.title(),
      total: this.total(),
      page: this.page(),
      pages: this.pages(),
      scrollY: window.scrollY,
    });
  }
  private restoreScroll(position: number, url: string) {
    this.restoreFrame = requestAnimationFrame(() => {
      this.restoreFrame = requestAnimationFrame(() => {
        if (!this.destroyed && this.activeUrl === url)
          window.scrollTo({ top: position, behavior: 'instant' });
      });
    });
  }
  ngOnDestroy() {
    this.saveSnapshot();
    this.destroyed = true;
    this.generation++;
    this.abort?.abort();
    this.observer?.disconnect();
    clearTimeout(this.debounce);
    if (this.restoreFrame !== undefined) cancelAnimationFrame(this.restoreFrame);
  }
}
