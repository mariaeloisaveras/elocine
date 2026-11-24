import { describe, expect, it } from 'vitest';
import { clampPosition, formatTime, routeFor } from './time';
describe('Timeline and navigation', () => {
  it('keeps total time correct beyond one hour and after remote seeks', () => {
    expect(formatTime(1812)).toBe('30:12');
    expect(formatTime(5420)).toBe('1:30:20');
    expect(formatTime(NaN)).toBe('00:00');
  });
  it('clamps seeks at the episode boundaries', () => {
    expect(clampPosition(-10, 1800)).toBe(0);
    expect(clampPosition(1900, 1800)).toBe(1799.9);
  });
  it('links episodes back to the parent series playback page', () => {
    expect(routeFor({ kind: 'episode', id: '101', parent_id: '1' })).toBe('/watch/series/1');
  });
});
