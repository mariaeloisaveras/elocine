import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ScheduleStore } from '../../infrastructure/schedule.store';
import { LiveGuide } from './live-guide';

const now = 1_800_000_000;
const programmes = [
  { title: 'Jornal', description: 'Notícias de hoje', start: now - 1800, end: now + 1800 },
  { title: 'Cinema', description: 'Um filme', start: now + 1800, end: now + 5400 },
];
describe('Programação ao vivo', () => {
  const get = vi.fn();
  let visible: (value: boolean) => void;
  beforeEach(() => {
    get.mockReset().mockResolvedValue({ programmes });
    vi.spyOn(Date, 'now').mockReturnValue(now * 1000);
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(callback: IntersectionObserverCallback) {
          visible = (value) =>
            callback(
              [{ isIntersecting: value } as IntersectionObserverEntry],
              this as unknown as IntersectionObserver,
            );
        }
        observe = vi.fn();
        disconnect = vi.fn();
      },
    );
    TestBed.configureTestingModule({ providers: [{ provide: ScheduleStore, useValue: { get } }] });
  });
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });
  async function create(mode: 'card' | 'player') {
    const fixture = TestBed.createComponent(LiveGuide);
    fixture.componentRef.setInput('channel', '42');
    fixture.componentRef.setInput('mode', mode);
    fixture.detectChanges();
    await fixture.whenStable();
    return fixture;
  }
  it('fetches card schedules only when visible and displays current progress', async () => {
    const fixture = await create('card');
    expect(get).not.toHaveBeenCalled();
    visible(true);
    await fixture.whenStable();
    fixture.detectChanges();
    expect(get).toHaveBeenCalledWith('42');
    expect(fixture.nativeElement.textContent).toContain('Jornal');
    expect(
      fixture.nativeElement.querySelector('[role="progressbar"]').getAttribute('aria-valuenow'),
    ).toBe('50');
  });
  it('shows now/next and opens a nonmodal panel that closes with Escape', async () => {
    const fixture = await create('player');
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Agora: Jornal');
    expect(fixture.nativeElement.textContent).toContain('A seguir: Cinema');
    fixture.nativeElement.querySelector('.guide-toggle').click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('article')).toHaveLength(2);
    expect(fixture.nativeElement.querySelector('article.current').textContent).toContain(
      'Notícias de hoje',
    );
    fixture.nativeElement
      .querySelector('aside')
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('aside')).toBeNull();
  });
  it('moves to the next programme at its boundary and handles unavailable metadata', async () => {
    const fixture = await create('player');
    vi.mocked(Date.now).mockReturnValue((now + 1800) * 1000);
    await fixture.componentInstance.refresh();
    expect(fixture.componentInstance.current()?.title).toBe('Cinema');
    expect(fixture.componentInstance.progress()).toBe(0);
    get.mockRejectedValueOnce(new Error('offline'));
    await fixture.componentInstance.refresh();
    expect(fixture.componentInstance.error()).toBe(true);
    get.mockResolvedValue({ programmes: [] });
    await fixture.componentInstance.refresh();
    fixture.componentInstance.show();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Programação indisponível');
  });
});
