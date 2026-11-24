import {
  CatalogKind,
  CatalogQuery,
  CatalogRepository,
  PlatformCatalogQuery,
} from '../domain/media';

export class CatalogUseCases {
  constructor(private readonly repository: CatalogRepository) {}
  schedule(id: string, signal?: AbortSignal) {
    return this.repository.schedule(id, signal);
  }
  search(query: CatalogQuery, signal?: AbortSignal) {
    return this.repository.search(
      { ...query, q: (query.q || '').trim(), page: Math.max(1, query.page || 1) },
      signal,
    );
  }
  home(signal?: AbortSignal) {
    return Promise.all(
      (['movie', 'series', 'live'] as CatalogKind[]).map(async (kind) => ({
        kind,
        page: await this.repository.search({ kind, limit: 12 }, signal),
      })),
    );
  }
  platformCatalog(id: string, query: PlatformCatalogQuery, signal?: AbortSignal) {
    return this.repository.platformCatalog(
      id,
      { ...query, q: (query.q || '').trim(), page: Math.max(1, query.page || 1) },
      signal,
    );
  }
  platforms(signal?: AbortSignal) {
    return this.repository.platforms(signal);
  }
  categories(kind: CatalogKind, signal?: AbortSignal) {
    return this.repository.categories(kind, signal);
  }
  details(kind: CatalogKind, id: string, signal?: AbortSignal) {
    return this.repository.details(kind, id, signal);
  }
  account(signal?: AbortSignal) {
    return this.repository.account(signal);
  }
}
