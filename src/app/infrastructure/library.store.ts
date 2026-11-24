import { Injectable, signal } from '@angular/core';
import { HistoryEntry, MediaItem } from '../domain/media';

@Injectable({ providedIn: 'root' })
export class LibraryStore {
  readonly history = signal<HistoryEntry[]>(this.readHistory());
  readonly compatibility = signal(this.read<unknown>('elocine.compatibility', true) !== false);
  lastCatalogUrl = '/';
  private lastWrite = 0;
  private read<T>(key: string, fallback: T): T {
    try {
      const value =
        localStorage.getItem(key) ?? localStorage.getItem(key.replace(/^elocine\./, 'cineplay.'));
      return JSON.parse(value || 'null') ?? fallback;
    } catch {
      return fallback;
    }
  }
  private readHistory(): HistoryEntry[] {
    const stored = this.read<unknown>('elocine.history', []);
    if (!Array.isArray(stored)) return [];
    return stored.filter(
      (entry): entry is HistoryEntry =>
        !!entry?.item?.id && !!entry?.parent?.id && Number.isFinite(entry.position),
    );
  }
  private write(key: string, value: unknown) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Browsing and playback still work when the browser disables local storage.
    }
  }
  setCompatibility(value: boolean) {
    this.compatibility.set(value);
    this.write('elocine.compatibility', value);
  }
  remember(item: MediaItem, parent: MediaItem, position: number, duration: number, force = false) {
    if (item.kind === 'live' || position < 3 || !Number.isFinite(position)) return;
    if (!force && Date.now() - this.lastWrite < 4000) return;
    this.lastWrite = Date.now();
    const remaining = this.history().filter(
      (entry) => !(entry.parent.kind === parent.kind && entry.parent.id === parent.id),
    );
    if (!duration || position < duration - Math.min(20, duration * 0.05)) {
      remaining.unshift({ item, parent, position, duration, updated: Date.now() });
    }
    const entries = remaining.slice(0, 30);
    this.history.set(entries);
    this.write('elocine.history', entries);
  }
  resume(parent: MediaItem) {
    return this.history().find(
      (entry) => entry.parent.kind === parent.kind && entry.parent.id === parent.id,
    );
  }
  forget(parent: MediaItem) {
    const entries = this.history().filter(
      (entry) => !(entry.parent.kind === parent.kind && entry.parent.id === parent.id),
    );
    this.history.set(entries);
    this.write('elocine.history', entries);
  }
}
