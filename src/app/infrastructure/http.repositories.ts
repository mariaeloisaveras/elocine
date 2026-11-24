import { Injectable } from '@angular/core';
import {
  Account,
  ChannelSchedule,
  CatalogKind,
  CatalogPage,
  CatalogQuery,
  CatalogRepository,
  Category,
  Details,
  DownloadProgress,
  Playback,
  PlaybackRepository,
  PlaybackRequest,
  PlatformRail,
  PlatformCatalogPage,
  PlatformCatalogQuery,
} from '../domain/media';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch('/api' + path, init);
  } catch (error) {
    if ((error as Error).name === 'AbortError') throw error;
    throw new Error('Não foi possível conectar ao Elocine. Confira se o servidor está aberto.');
  }
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(
      typeof body.detail === 'string' ? body.detail : 'Não foi possível concluir. Tente novamente.',
    );
  }
  return response.status === 204 ? (undefined as T) : response.json();
}
const json = (body: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

@Injectable()
export class HttpCatalogRepository extends CatalogRepository {
  override schedule(id: string, signal?: AbortSignal) {
    return request<ChannelSchedule>('/channels/' + encodeURIComponent(id) + '/schedule', {
      signal,
    });
  }
  override platformCatalog(id: string, query: PlatformCatalogQuery, signal?: AbortSignal) {
    const params = new URLSearchParams();
    Object.entries(query).forEach(([key, value]) => {
      if (value !== undefined && value !== '') params.set(key, String(value));
    });
    return request<PlatformCatalogPage>('/platforms/' + encodeURIComponent(id) + '?' + params, {
      signal,
    });
  }
  override platforms(signal?: AbortSignal) {
    return request<PlatformRail[]>('/platforms', { signal });
  }
  override search(query: CatalogQuery, signal?: AbortSignal) {
    const params = new URLSearchParams();
    Object.entries(query).forEach(([key, value]) => {
      if (value !== undefined && value !== '') params.set(key, String(value));
    });
    return request<CatalogPage>('/catalog?' + params, { signal });
  }
  override categories(kind: CatalogKind, signal?: AbortSignal) {
    return request<Category[]>('/categories?kind=' + kind, { signal });
  }
  override details(kind: CatalogKind, id: string, signal?: AbortSignal) {
    return request<Details>(`/items/${kind}/${encodeURIComponent(id)}`, { signal });
  }
  override account(signal?: AbortSignal) {
    return request<Account>('/account', { signal });
  }
}
@Injectable()
export class HttpPlaybackRepository extends PlaybackRepository {
  override start(body: PlaybackRequest, signal?: AbortSignal) {
    return request<Playback>('/playbacks', { ...json(body), signal });
  }
  override seek(id: string, seconds: number) {
    return request<Playback>(`/playbacks/${id}/seek`, json({ seconds }));
  }
  override stop(id: string) {
    return request<void>(`/playbacks/${id}/stop`, { method: 'POST', keepalive: true });
  }
  override progress(id: string) {
    return request<DownloadProgress>(`/playbacks/${id}/progress`);
  }
  override release(id: string) {
    const path = `/api/playbacks/${id}/stop`;
    if (!navigator.sendBeacon(path))
      void fetch(path, { method: 'POST', keepalive: true }).catch(() => {});
  }
}
