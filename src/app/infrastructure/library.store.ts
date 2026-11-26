import { Injectable, computed, signal } from '@angular/core';
import { avatarLetter, profileAvatar } from '../domain/profile-avatar';
import { HistoryEntry, MediaItem } from '../domain/media';

export type TitleReaction = 'liked' | 'loved' | 'disliked' | 'hated';
export interface EpisodeProgress {
  position: number;
  duration: number;
  completed: boolean;
}
export interface RatedTitle {
  item: MediaItem;
  reaction: TitleReaction;
  updated: number;
}

@Injectable({ providedIn: 'root' })
export class LibraryStore {
  private readonly avatarId = signal(
    profileAvatar(this.read<unknown>('elocine.avatar', 'classic')).id,
  );
  readonly avatarInitial = signal(
    avatarLetter(this.read<unknown>('elocine.avatarLetter', 'E')) || 'E',
  );
  readonly avatar = computed(() => {
    const avatar = profileAvatar(this.avatarId());
    return avatar.id === 'classic' ? { ...avatar, icon: this.avatarInitial() } : avatar;
  });
  setAvatarLetter(value: string) {
    const letter = avatarLetter(value);
    if (!letter) return;
    this.avatarInitial.set(letter);
    this.write('elocine.avatarLetter', letter);
    this.setAvatar('classic');
  }
  setAvatar(id: string) {
    const avatar = profileAvatar(id);
    this.avatarId.set(avatar.id);
    this.write('elocine.avatar', avatar.id);
  }
  readonly history = signal<HistoryEntry[]>(this.readHistory());
  readonly episodeHistory = signal<Record<string, EpisodeProgress>>(this.readEpisodeHistory());
  private readEpisodeHistory(): Record<string, EpisodeProgress> {
    const stored = this.read<unknown>('elocine.episodes', {});
    if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return {};
    return Object.fromEntries(
      Object.entries(stored).filter(
        ([, entry]) =>
          entry &&
          Number.isFinite(entry.position) &&
          entry.position >= 0 &&
          Number.isFinite(entry.duration) &&
          entry.duration >= 0 &&
          typeof entry.completed === 'boolean',
      ),
    );
  }
  episodeProgress(item: MediaItem, parentId = item.parent_id): number {
    const key = parentId + ':' + item.id;
    const saved = this.episodeHistory()[key];
    const legacy = this.history().find(
      (entry) =>
        entry.item.kind === 'episode' && entry.item.id === item.id && entry.parent.id === parentId,
    );
    const entry = saved || legacy;
    if (!entry) return 0;
    if (saved?.completed) return 100;
    const duration = entry.duration || item.duration;
    return duration > 0 ? Math.min(100, Math.max(0, (entry.position / duration) * 100)) : 0;
  }
  rememberEpisode(
    item: MediaItem,
    parentId: string,
    position: number,
    duration: number,
    completed = false,
  ) {
    if (
      item.kind !== 'episode' ||
      !parentId ||
      !Number.isFinite(position) ||
      !Number.isFinite(duration) ||
      position < 0 ||
      duration < 0
    )
      return;
    const key = parentId + ':' + item.id;
    const previous = this.episodeHistory()[key];
    const entry: EpisodeProgress = {
      position,
      duration,
      completed:
        !!previous?.completed ||
        completed ||
        (duration > 0 && position >= duration - Math.min(20, duration * 0.05)),
    };
    const entries = { ...this.episodeHistory(), [key]: entry };
    this.episodeHistory.set(entries);
    this.write('elocine.episodes', entries);
  }
  readonly completed = signal<MediaItem[]>(this.readTitles('elocine.completed'));
  readonly watchlist = signal<MediaItem[]>(this.readTitles('elocine.watchlist'));
  readonly ratings = signal<RatedTitle[]>(this.readRatings());
  private readTitles(key: string): MediaItem[] {
    const value = this.read<unknown>(key, []);
    return Array.isArray(value)
      ? value.filter((item) => item?.id && ['movie', 'series'].includes(item.kind))
      : [];
  }
  private readRatings(): RatedTitle[] {
    const value = this.read<unknown>('elocine.ratings', []);
    return Array.isArray(value)
      ? value.filter(
          (entry) =>
            entry?.item?.id &&
            ['movie', 'series'].includes(entry.item.kind) &&
            ['liked', 'loved', 'disliked', 'hated'].includes(entry.reaction),
        )
      : [];
  }
  private same(a: MediaItem, b: MediaItem) {
    return a.kind === b.kind && a.id === b.id;
  }
  wants(item: MediaItem) {
    return this.watchlist().some((entry) => this.same(entry, item));
  }
  toggleWatchlist(item: MediaItem) {
    if (!['movie', 'series'].includes(item.kind)) return;
    const entries = this.watchlist().filter((entry) => !this.same(entry, item));
    if (!this.wants(item)) entries.unshift(item);
    this.watchlist.set(entries);
    this.write('elocine.watchlist', entries);
  }
  reaction(item: MediaItem) {
    return this.ratings().find((entry) => this.same(entry.item, item))?.reaction;
  }
  rate(item: MediaItem, reaction: TitleReaction) {
    if (!['movie', 'series'].includes(item.kind)) return;
    const entries = this.ratings().filter((entry) => !this.same(entry.item, item));
    if (this.reaction(item) !== reaction) entries.unshift({ item, reaction, updated: Date.now() });
    this.ratings.set(entries);
    this.write('elocine.ratings', entries);
  }
  finish(item: MediaItem) {
    if (!['movie', 'series'].includes(item.kind)) return;
    const entries = [item, ...this.completed().filter((entry) => !this.same(entry, item))].slice(
      0,
      100,
    );
    this.completed.set(entries);
    this.write('elocine.completed', entries);
    this.forget(item);
    if (this.wants(item)) this.toggleWatchlist(item);
  }
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
  remember(
    item: MediaItem,
    parent: MediaItem,
    position: number,
    duration: number,
    force = false,
    seasonFinished = false,
  ) {
    if (item.kind === 'live' || position < 3 || !Number.isFinite(position)) return;
    if (!force && Date.now() - this.lastWrite < 4000) return;
    this.lastWrite = Date.now();
    this.rememberEpisode(item, parent.id, position, duration);
    const remaining = this.history().filter(
      (entry) => !(entry.parent.kind === parent.kind && entry.parent.id === parent.id),
    );
    if (!duration || position < duration - Math.min(20, duration * 0.05)) {
      remaining.unshift({ item, parent, position, duration, updated: Date.now() });
    }
    if (
      duration > 0 &&
      position >= duration - Math.min(20, duration * 0.05) &&
      (parent.kind === 'movie' || seasonFinished)
    )
      this.finish(parent);
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
