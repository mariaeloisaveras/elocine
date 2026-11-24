import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CatalogUseCases } from '../application/catalog.use-cases';
import { ScheduleStore } from './schedule.store';

afterEach(() => {
  TestBed.resetTestingModule();
  vi.restoreAllMocks();
});
describe('Cache de programação', () => {
  it('shares requests between card and player and refreshes after one minute', async () => {
    let time = 1000;
    vi.spyOn(Date, 'now').mockImplementation(() => time);
    const schedule = vi.fn().mockResolvedValue({ programmes: [] });
    TestBed.configureTestingModule({
      providers: [{ provide: CatalogUseCases, useValue: { schedule } }],
    });
    const store = TestBed.inject(ScheduleStore);
    await Promise.all([store.get('42'), store.get('42')]);
    expect(schedule).toHaveBeenCalledTimes(1);
    time += 60001;
    await store.get('42');
    expect(schedule).toHaveBeenCalledTimes(2);
  });
  it('allows retrying failed requests instead of caching the error', async () => {
    const schedule = vi
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue({ programmes: [] });
    TestBed.configureTestingModule({
      providers: [{ provide: CatalogUseCases, useValue: { schedule } }],
    });
    const store = TestBed.inject(ScheduleStore);
    await expect(store.get('42')).rejects.toThrow('offline');
    await expect(store.get('42')).resolves.toEqual({ programmes: [] });
  });
});
