import { beforeEach, describe, expect, it } from 'vitest';
import { LibraryStore } from './library.store';
import { MediaItem } from '../domain/media';

const movie = { id: '1', kind: 'movie', title: 'Filme' } as MediaItem;
const series = { id: '1', kind: 'series', title: 'Série' } as MediaItem;
const episode = { id: 'ep', kind: 'episode', parent_id: '1' } as MediaItem;

describe('Profile library', () => {
  beforeEach(() => localStorage.clear());

  it('uses the default avatar when saved selection is invalid', () => {
    localStorage.setItem('elocine.avatar', '"missing"');
    const store = new LibraryStore();
    expect(store.avatar().id).toBe('classic');
    store.setAvatar('ghost');
    expect(new LibraryStore().avatar().icon).toBe('👻');
  });

  it('persists the watchlist and keeps movie and series IDs distinct', () => {
    const store = new LibraryStore();
    store.toggleWatchlist(movie);
    store.toggleWatchlist(series);
    const restored = new LibraryStore();
    expect(restored.watchlist()).toEqual([series, movie]);
    restored.toggleWatchlist(series);
    expect(new LibraryStore().watchlist()).toEqual([movie]);
  });

  it('replaces a reaction and removes it when selected again', () => {
    const store = new LibraryStore();
    store.rate(movie, 'liked');
    store.rate(movie, 'loved');
    store.rate(series, 'hated');
    const restored = new LibraryStore();
    expect(restored.reaction(movie)).toBe('loved');
    expect(restored.reaction(series)).toBe('hated');
    expect(restored.ratings()).toHaveLength(2);
    restored.rate(movie, 'disliked');
    expect(new LibraryStore().reaction(movie)).toBe('disliked');
    restored.rate(movie, 'disliked');
    expect(new LibraryStore().reaction(movie)).toBeUndefined();
  });

  it('moves finished movies out of continue watching and into recently watched', () => {
    const store = new LibraryStore();
    store.toggleWatchlist(movie);
    store.remember(movie, movie, 100, 1000, true);
    expect(store.completed()).toEqual([]);
    store.remember(movie, movie, 990, 1000, true);
    expect(store.resume(movie)).toBeUndefined();
    expect(new LibraryStore().completed()).toEqual([movie]);
    expect(store.wants(movie)).toBe(false);
    store.finish(movie);
    expect(store.completed()).toHaveLength(1);
  });

  it('records the series title when a season finishes', () => {
    const store = new LibraryStore();
    store.remember(episode, series, 990, 1000, true);
    expect(store.completed()).toEqual([]);
    store.remember(episode, series, 990, 1000, true, true);
    expect(store.completed()).toEqual([series]);
  });

  it('keeps each episode progress after moving to another episode and completing the series', () => {
    const store = new LibraryStore();
    const second = { ...episode, id: 'ep2' };
    store.remember(episode, series, 500, 1000, true);
    store.remember(second, series, 100, 1000, true);
    expect(store.episodeProgress(episode)).toBe(50);
    expect(store.episodeProgress(second)).toBe(10);
    store.rememberEpisode(episode, series.id, 1000, 1000, true);
    store.finish(series);
    const restored = new LibraryStore();
    expect(restored.episodeProgress(episode)).toBe(100);
    expect(restored.episodeProgress(second)).toBe(10);
    restored.rememberEpisode(episode, series.id, 50, 1000);
    expect(restored.episodeProgress(episode)).toBe(100);
    expect(restored.episodeProgress(episode, 'another-series')).toBe(0);
  });

  it('ignores invalid stored collections', () => {
    localStorage.setItem('elocine.completed', '{}');
    localStorage.setItem('elocine.watchlist', '[null,{}]');
    localStorage.setItem(
      'elocine.ratings',
      '[{"item":{"id":"1","kind":"movie"},"reaction":"invalid"}]',
    );
    const store = new LibraryStore();
    expect(store.completed()).toEqual([]);
    expect(store.watchlist()).toEqual([]);
    expect(store.ratings()).toEqual([]);
  });
});
