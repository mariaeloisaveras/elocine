import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SUBTITLE_APPEARANCE } from '../domain/subtitle-appearance';
import { SubtitleAppearanceStore } from './subtitle-appearance.store';

const key = 'elocine.subtitle-appearance';
afterEach(() => {
  localStorage.removeItem(key);
  vi.restoreAllMocks();
});
describe('Preferências da legenda', () => {
  it('recovers from corrupt storage and validates each saved option', () => {
    localStorage.setItem(key, '{broken');
    expect(new SubtitleAppearanceStore().settings()).toEqual(DEFAULT_SUBTITLE_APPEARANCE);
    localStorage.setItem(
      key,
      JSON.stringify({ size: 'huge', color: 'invalid', background: 'invalid', outline: 'false' }),
    );
    const preferences = new SubtitleAppearanceStore();
    expect(preferences.settings()).toEqual(DEFAULT_SUBTITLE_APPEARANCE);
    preferences.update('size', 'large');
    preferences.update('color', 'cyan');
    expect(preferences.settings()).toMatchObject({ size: 'large', color: 'cyan' });
  });
  it('keeps settings usable when local storage is blocked', () => {
    const preferences = new SubtitleAppearanceStore();
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(() => preferences.update('color', 'yellow')).not.toThrow();
    expect(preferences.settings().color).toBe('yellow');
  });
});
