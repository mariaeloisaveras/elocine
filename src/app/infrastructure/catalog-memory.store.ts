import { Injectable } from '@angular/core';
import { MediaItem } from '../domain/media';

export interface CatalogSnapshot {
  items: MediaItem[];
  title: string;
  total: number;
  page: number;
  pages: number;
  scrollY: number;
}

/** In-memory navigation state, bounded to avoid retaining every catalog ever visited. */
@Injectable({ providedIn: 'root' })
export class CatalogMemoryStore {
  private readonly snapshots = new Map<string, CatalogSnapshot>();
  get(url: string) {
    return this.snapshots.get(url);
  }
  save(url: string, snapshot: CatalogSnapshot) {
    this.snapshots.delete(url);
    this.snapshots.set(url, { ...snapshot, items: [...snapshot.items] });
    if (this.snapshots.size > 8) this.snapshots.delete(this.snapshots.keys().next().value!);
  }
}
