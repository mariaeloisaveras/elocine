import { Injectable, signal } from '@angular/core';
import {
  DEFAULT_SUBTITLE_APPEARANCE,
  SubtitleAppearance,
  normalizeSubtitleAppearance,
} from '../domain/subtitle-appearance';

const STORAGE_KEY = 'elocine.subtitle-appearance';

@Injectable({ providedIn: 'root' })
export class SubtitleAppearanceStore {
  private readonly state = signal<SubtitleAppearance>(this.read());
  readonly settings = this.state.asReadonly();
  update(key: keyof SubtitleAppearance, value: unknown) {
    this.save(normalizeSubtitleAppearance({ ...this.state(), [key]: value }));
  }
  reset() {
    this.save({ ...DEFAULT_SUBTITLE_APPEARANCE });
  }
  private save(value: SubtitleAppearance) {
    this.state.set(value);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
    } catch {
      // Keep the current preference even when storage is unavailable.
    }
  }
  private read() {
    try {
      return normalizeSubtitleAppearance(JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'));
    } catch {
      return { ...DEFAULT_SUBTITLE_APPEARANCE };
    }
  }
}
