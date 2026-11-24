import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { CatalogUseCases } from '../../application/catalog.use-cases';
import {
  Account,
  CatalogKind,
  CatalogPage,
  Category,
  MediaItem,
  PlatformRail,
} from '../../domain/media';
import { routeFor } from '../../domain/time';
import { LibraryStore } from '../../infrastructure/library.store';
import { ProfileAvatar } from '../shared/profile-avatar';
import { Icon } from '../shared/icon';
import { MediaCard } from '../shared/media-card';
import { MediaCarousel } from '../shared/media-carousel';
import { PlatformCarousel } from './platform-carousel';

@Component({
  standalone: true,
  imports: [RouterLink, Icon, MediaCard, MediaCarousel, PlatformCarousel, ProfileAvatar],
  templateUrl: './home.page.html',
  styleUrl: './home.page.css',
})
export class HomePage {
  readonly library = inject(LibraryStore);
  private readonly catalog = inject(CatalogUseCases);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly destroy = inject(DestroyRef);
  readonly kind = signal<CatalogKind | 'all'>('all');
  readonly query = signal('');
  readonly category = signal('');
  readonly platformId = signal('');
  readonly platformRails = signal<PlatformRail[]>([]);
  readonly platformLoading = signal(false);
  readonly platformError = signal('');
  readonly platformTitle = computed(
    () =>
      this.platformRails().find((rail) => rail.id === this.platformId())?.name ||
      'Seleção por plataforma',
  );
  readonly categories = signal<Category[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly account = signal<Account | null>(null);
  readonly accountOpen = signal(false);
  readonly results = signal<CatalogPage>({ items: [], total: 0, page: 1, pages: 1 });
  readonly rails = signal<{ kind: CatalogKind; page: CatalogPage }[]>([]);
  readonly featured = computed(() =>
    !this.query() && !this.platformId() && this.kind() === 'all'
      ? this.rails().find((r) => r.kind === 'movie')?.page.items[0]
      : undefined,
  );
  readonly heading = computed(() =>
    this.query()
      ? `Resultados para “${this.query()}”`
      : this.platformId()
        ? this.platformTitle()
        : {
            all: 'Seu próximo play começa aqui',
            movie: 'Filmes para todos os momentos',
            series: 'Só mais um episódio',
            live: 'O melhor acontece agora',
          }[this.kind()],
  );
  readonly railLoading = signal<Partial<Record<CatalogKind, boolean>>>({});
  readonly railErrors = signal<Partial<Record<CatalogKind, string>>>({});
  private abort?: AbortController;
  private debounce?: ReturnType<typeof setTimeout>;
  readonly labels: Record<CatalogKind, string> = {
    movie: 'Novidades que merecem o seu play',
    series: 'Uma história, muitos episódios',
    live: 'Agora, ao vivo',
  };
  readonly skeletons = Array.from({ length: 8 }, (_, i) => i);
  constructor() {
    this.catalog
      .account()
      .then((account) => this.account.set(account))
      .catch(() => {});
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroy)).subscribe((params) => {
      const raw = params.get('kind');
      this.kind.set(raw === 'movie' || raw === 'series' || raw === 'live' ? raw : 'all');
      this.query.set(params.get('q') || '');
      this.category.set(params.get('category') || '');
      this.platformId.set(params.get('platform') || '');
      this.library.lastCatalogUrl = this.router.url;
      void this.load(Math.max(1, Number(params.get('page')) || 1));
    });
    this.destroy.onDestroy(() => {
      this.abort?.abort();
      clearTimeout(this.debounce);
    });
  }
  async load(page = 1) {
    this.abort?.abort();
    const abort = new AbortController();
    this.abort = abort;
    this.loading.set(true);
    this.railLoading.set({});
    this.railErrors.set({});
    this.error.set('');
    this.platformLoading.set(false);
    if ((this.kind() === 'all' && !this.query()) || this.platformId()) {
      if (!this.platformRails().length) void this.loadPlatforms(abort.signal);
    }
    try {
      if (this.kind() === 'all') {
        const kinds: CatalogKind[] = this.platformId()
          ? ['movie', 'series']
          : ['movie', 'series', 'live'];
        const rails =
          this.query() || this.platformId()
            ? await Promise.all(
                kinds.map(async (kind) => ({
                  kind,
                  page: await this.catalog.search(
                    { kind, q: this.query(), platform: this.platformId(), limit: 18 },
                    abort.signal,
                  ),
                })),
              )
            : await this.catalog.home(abort.signal);
        if (abort.signal.aborted) return;
        this.rails.set(rails);
        this.categories.set([]);
      } else {
        const kind = this.kind() as CatalogKind;
        const [results, categories] = await Promise.all([
          this.catalog.search(
            {
              kind,
              q: this.query(),
              category: this.category(),
              platform: this.platformId(),
              page,
              limit: 30,
            },
            abort.signal,
          ),
          this.catalog.categories(kind, abort.signal),
        ]);
        if (abort.signal.aborted) return;
        this.results.set(results);
        this.categories.set(categories);
      }
    } catch (error) {
      if (!abort.signal.aborted) this.error.set((error as Error).message);
    } finally {
      if (!abort.signal.aborted) this.loading.set(false);
    }
  }
  async loadMoreRail(kind: CatalogKind) {
    const rail = this.rails().find((entry) => entry.kind === kind);
    const signal = this.abort?.signal;
    if (!rail || rail.page.page >= rail.page.pages || this.railLoading()[kind] || signal?.aborted)
      return;
    this.railLoading.update((state) => ({ ...state, [kind]: true }));
    this.railErrors.update((state) => ({ ...state, [kind]: '' }));
    try {
      const page = await this.catalog.search(
        {
          kind,
          q: this.query(),
          platform: this.platformId(),
          page: rail.page.page + 1,
          limit: this.query() || this.platformId() ? 18 : 12,
        },
        signal,
      );
      if (signal?.aborted) return;
      const seen = new Set(rail.page.items.map((item) => item.id));
      this.rails.update((rails) =>
        rails.map((entry) =>
          entry.kind === kind
            ? {
                kind,
                page: {
                  ...page,
                  items: [...rail.page.items, ...page.items.filter((item) => !seen.has(item.id))],
                },
              }
            : entry,
        ),
      );
    } catch (error) {
      if (!signal?.aborted)
        this.railErrors.update((state) => ({ ...state, [kind]: (error as Error).message }));
    } finally {
      if (!signal?.aborted) this.railLoading.update((state) => ({ ...state, [kind]: false }));
    }
  }
  async loadPlatforms(signal = this.abort?.signal) {
    this.platformLoading.set(true);
    this.platformError.set('');
    try {
      const rails = await this.catalog.platforms(signal);
      if (!signal?.aborted) this.platformRails.set(rails);
    } catch {
      if (!signal?.aborted)
        this.platformError.set('Não foi possível organizar os títulos por plataforma.');
    } finally {
      if (!signal?.aborted) this.platformLoading.set(false);
    }
  }
  search(event: Event) {
    const q = (event.target as HTMLInputElement).value;
    clearTimeout(this.debounce);
    this.debounce = setTimeout(() => this.navigate({ q, page: 1 }), 350);
  }
  clearSearch() {
    this.navigate({ q: '', page: 1 });
  }
  selectCategory(event: Event) {
    this.navigate({ category: (event.target as HTMLSelectElement).value, page: 1 });
  }
  navigate(values: Record<string, string | number>) {
    void this.router.navigate(['/'], {
      queryParams: {
        kind: this.kind(),
        q: this.query(),
        category: this.category(),
        platform: this.platformId(),
        ...values,
      },
      replaceUrl: true,
    });
  }
  page(delta: number) {
    this.navigate({ page: this.results().page + delta });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  link(item: MediaItem) {
    return routeFor(item);
  }
  historyProgress(position: number, duration: number) {
    return duration ? Math.min(100, (position / duration) * 100) : 0;
  }
  empty() {
    return this.kind() === 'all' ? this.rails().every((r) => !r.page.total) : !this.results().total;
  }
}
