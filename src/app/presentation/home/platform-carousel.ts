import { Component, DestroyRef, computed, effect, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CatalogUseCases } from '../../application/catalog.use-cases';
import { MediaItem, PlatformRail } from '../../domain/media';
import { Icon } from '../shared/icon';
import { MediaCard } from '../shared/media-card';
import { MediaCarousel } from '../shared/media-carousel';
import { platformBrand } from '../shared/platform-brand';

@Component({
  selector: 'platform-carousel',
  standalone: true,
  imports: [RouterLink, Icon, MediaCard, MediaCarousel],
  templateUrl: './platform-carousel.html',
  styleUrl: './platform-carousel.css',
})
export class PlatformCarousel {
  readonly rail = input.required<PlatformRail>();
  private readonly catalog = inject(CatalogUseCases);
  readonly items = signal<MediaItem[]>([]);
  readonly page = signal(1);
  readonly total = signal(0);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly hasMore = computed(() => this.items().length < this.total());
  private abort = new AbortController();
  private pageSize = 12;
  constructor() {
    effect(() => {
      const rail = this.rail();
      this.abort.abort();
      this.abort = new AbortController();
      this.items.set(rail.items);
      this.total.set(rail.total);
      this.page.set(1);
      this.pageSize = rail.items.length || 12;
      this.loading.set(false);
      this.error.set('');
    });
    inject(DestroyRef).onDestroy(() => this.abort.abort());
  }
  async loadMore() {
    if (!this.hasMore() || this.loading()) return;
    const signal = this.abort.signal;
    this.loading.set(true);
    this.error.set('');
    try {
      const result = await this.catalog.platformCatalog(
        this.rail().id,
        { page: this.page() + 1, limit: this.pageSize },
        signal,
      );
      if (signal.aborted) return;
      const seen = new Set(this.items().map((item) => item.kind + ':' + item.id));
      this.items.update((items) => [
        ...items,
        ...result.items.filter((item) => !seen.has(item.kind + ':' + item.id)),
      ]);
      this.page.set(result.page);
      this.total.set(result.total);
      if (result.page >= result.pages) this.total.set(this.items().length);
    } catch (error) {
      if (!signal.aborted) this.error.set((error as Error).message);
    } finally {
      if (!signal.aborted) this.loading.set(false);
    }
  }
  brand() {
    return platformBrand(this.rail().id);
  }
}
