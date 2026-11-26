import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CatalogUseCases } from '../../application/catalog.use-cases';
import { VideoPlayer, LIVE_STALL_TIMEOUT_MS } from './video-player';
import { SubtitleAppearanceStore } from '../../infrastructure/subtitle-appearance.store';
import { Playback } from '../../domain/media';

const hlsMock = vi.hoisted(() => ({
  handlers: new Map<
    string,
    (event: string, data: { fatal: boolean; type: string; response?: { code: number } }) => void
  >(),
  startLoad: vi.fn(),
  stopLoad: vi.fn(),
  recoverMediaError: vi.fn(),
}));
vi.mock('hls.js', () => ({
  default: class {
    static isSupported() {
      return true;
    }
    static Events = { ERROR: 'error' };
    static ErrorTypes = { NETWORK_ERROR: 'networkError', MEDIA_ERROR: 'mediaError' };
    on(event: string, callback: (event: string, data: { fatal: boolean; type: string }) => void) {
      hlsMock.handlers.set(event, callback);
    }
    loadSource() {}
    attachMedia() {}
    destroy() {}
    stopLoad = hlsMock.stopLoad;
    startLoad = hlsMock.startLoad;
    recoverMediaError = hlsMock.recoverMediaError;
  },
}));

const session: Playback = {
  id: 'session',
  media_url: 'http://127.0.0.1:9000/media/token/compat.mp4',
  compatibility: true,
  prefetch: true,
  is_hls: false,
  can_seek: true,
  offset: 0,
  item: {
    id: '101',
    kind: 'episode',
    title: 'Episódio',
    duration: 3600,
    artwork: '',
    backdrop: '',
    category_id: '',
    rating: '',
    year: '',
    synopsis: '',
    parent_id: '1',
    season: '1',
    episode: '1',
  },
};
describe('Player integrado', () => {
  beforeEach(() => {
    hlsMock.handlers.clear();
    hlsMock.startLoad.mockClear();
    hlsMock.stopLoad.mockClear();
    hlsMock.recoverMediaError.mockClear();
    localStorage.removeItem('elocine.subtitle-appearance');
    vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
  });
  afterEach(() => {
    TestBed.resetTestingModule();
    localStorage.removeItem('elocine.subtitle-appearance');
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });
  async function create() {
    const fixture = TestBed.createComponent(VideoPlayer);
    fixture.componentRef.setInput('playback', session);
    fixture.detectChanges();
    await fixture.whenStable();
    return fixture;
  }
  it('recovers live HLS failures before showing an error and bounds retries', async () => {
    TestBed.configureTestingModule({
      providers: [
        {
          provide: CatalogUseCases,
          useValue: { schedule: vi.fn().mockResolvedValue({ programmes: [] }) },
        },
      ],
    });
    hlsMock.startLoad.mockClear();
    hlsMock.recoverMediaError.mockClear();
    const fixture = await create();
    fixture.componentRef.setInput('playback', {
      ...session,
      is_hls: true,
      compatibility: false,
      item: { ...session.item, kind: 'live' },
    });
    fixture.detectChanges();
    await fixture.whenStable();
    await vi.waitFor(() => expect(hlsMock.handlers.has('error')).toBe(true));
    const fail = hlsMock.handlers.get('error')!;
    fail('error', { fatal: true, type: 'networkError' });
    expect(hlsMock.startLoad).toHaveBeenCalledTimes(1);
    expect(fixture.componentInstance.error()).toBe('');
    fail('error', { fatal: true, type: 'mediaError' });
    expect(hlsMock.recoverMediaError).toHaveBeenCalledTimes(1);
    expect(fixture.componentInstance.error()).toBe('');
    for (let attempt = 0; attempt < 3; attempt++)
      fail('error', { fatal: true, type: 'networkError' });
    expect(hlsMock.startLoad).toHaveBeenCalledTimes(3);
    expect(fixture.componentInstance.error()).not.toBe('');
    fixture.destroy();
  });

  it.each([401, 403])(
    'stops live HLS access refusals (HTTP %s) without reconnecting',
    async (status) => {
      TestBed.configureTestingModule({
        providers: [
          {
            provide: CatalogUseCases,
            useValue: { schedule: vi.fn().mockResolvedValue({ programmes: [] }) },
          },
        ],
      });
      const fixture = await create();
      fixture.componentRef.setInput('playback', {
        ...session,
        is_hls: true,
        compatibility: false,
        item: { ...session.item, kind: 'live' },
      });
      fixture.detectChanges();
      await fixture.whenStable();
      await vi.waitFor(() => expect(hlsMock.handlers.has('error')).toBe(true));
      const video = fixture.nativeElement.querySelector('video') as HTMLVideoElement;
      const pause = vi.spyOn(video, 'pause');
      pause.mockClear();
      hlsMock.handlers.get('error')!('error', {
        fatal: true,
        type: 'networkError',
        response: { code: status },
      });
      fixture.detectChanges();
      expect(hlsMock.startLoad).not.toHaveBeenCalled();
      expect(hlsMock.recoverMediaError).not.toHaveBeenCalled();
      expect(hlsMock.stopLoad).toHaveBeenCalledTimes(1);
      expect(pause).toHaveBeenCalled();
      expect(fixture.componentInstance.problem()).toContain(`HTTP ${status}`);
      expect(fixture.componentInstance.problem()).toContain('limite de conexões');
      expect(fixture.componentInstance.loading()).toBe(false);
      expect(fixture.nativeElement.querySelector('.loading-overlay')).toBeNull();
      fixture.destroy();
    },
  );

  async function createLive() {
    TestBed.configureTestingModule({
      providers: [
        {
          provide: CatalogUseCases,
          useValue: { schedule: vi.fn().mockResolvedValue({ programmes: [] }) },
        },
      ],
    });
    const fixture = await create();
    vi.useFakeTimers();
    fixture.componentRef.setInput('playback', {
      ...session,
      item: { ...session.item, kind: 'live' },
    });
    fixture.detectChanges();
    return fixture;
  }
  it('ends indefinite live buffering and offers retry when video stops advancing', async () => {
    const fixture = await createLive();
    await vi.advanceTimersByTimeAsync(LIVE_STALL_TIMEOUT_MS);
    fixture.detectChanges();
    expect(fixture.componentInstance.loading()).toBe(false);
    expect(fixture.nativeElement.textContent).toContain('O canal parou de enviar vídeo');
    expect(fixture.nativeElement.textContent).toContain('Tentar novamente');
    expect(fixture.nativeElement.querySelector('.loading-overlay')).toBeNull();
    fixture.destroy();
  });
  it('limits the preparing overlay even if the media clock keeps advancing', async () => {
    const fixture = await createLive();
    const video = fixture.nativeElement.querySelector('video') as HTMLVideoElement;
    for (let second = 1; second <= 26; second++) {
      video.currentTime = second;
      await vi.advanceTimersByTimeAsync(1000);
    }
    fixture.detectChanges();
    expect(fixture.componentInstance.loading()).toBe(false);
    expect(fixture.componentInstance.error()).toContain('parou de enviar vídeo');
    expect(fixture.nativeElement.querySelector('.loading-overlay')).toBeNull();
    fixture.destroy();
  });
  it('continues stall monitoring after an external error clears', async () => {
    const fixture = await createLive();
    fixture.componentRef.setInput('externalError', 'Falha temporária');
    fixture.detectChanges();
    await vi.advanceTimersByTimeAsync(1000);
    fixture.componentRef.setInput('externalError', '');
    fixture.detectChanges();
    await vi.advanceTimersByTimeAsync(LIVE_STALL_TIMEOUT_MS);
    expect(fixture.componentInstance.error()).toContain('parou de enviar vídeo');
    fixture.destroy();
  });

  it('does not show a server warning over resumed live video', async () => {
    const fixture = await createLive();
    const player = fixture.componentInstance;
    fixture.componentRef.setInput(
      'externalError',
      'O canal ficou sem enviar vídeo por 25 segundos.',
    );
    fixture.detectChanges();
    player.onWaiting();
    expect(player.problem()).not.toBe('');
    player.error.set('Falha anterior');
    player.onPlaying();
    fixture.detectChanges();
    expect(player.problem()).toBe('');
    expect(fixture.nativeElement.querySelector('.player-error')).toBeNull();
    expect(fixture.nativeElement.querySelector('.loading-overlay')).toBeNull();
    player.onWaiting();
    expect(player.problem()).not.toBe('');
    fixture.destroy();
  });

  it.each([401, 403])('pauses live playback when the server reports HTTP %s', async (status) => {
    const fixture = await createLive();
    fixture.componentInstance.onPlaying();
    const video = fixture.nativeElement.querySelector('video') as HTMLVideoElement;
    const pause = vi.spyOn(video, 'pause');
    pause.mockClear();
    fixture.componentRef.setInput(
      'externalError',
      `O provedor recusou a reprodução (HTTP ${status}).`,
    );
    fixture.detectChanges();
    expect(pause).toHaveBeenCalled();
    expect(fixture.componentInstance.problem()).toContain(`HTTP ${status}`);
    expect(fixture.componentInstance.loading()).toBe(false);
    expect(fixture.nativeElement.querySelector('.player-error')).not.toBeNull();
    fixture.destroy();
  });

  it('does not time out healthy live playback or an intentional pause', async () => {
    const fixture = await createLive();
    const video = fixture.nativeElement.querySelector('video') as HTMLVideoElement;
    fixture.componentInstance.onPlaying();
    for (let second = 1; second <= 30; second++) {
      video.currentTime = second;
      await vi.advanceTimersByTimeAsync(1000);
    }
    expect(fixture.componentInstance.error()).toBe('');
    fixture.componentInstance.onPause();
    await vi.advanceTimersByTimeAsync(LIVE_STALL_TIMEOUT_MS + 1000);
    expect(fixture.componentInstance.error()).toBe('');
    fixture.destroy();
  });
  it('shows a reconnect error when a live stream ends rather than treating it as completed', async () => {
    const fixture = await createLive();
    const ended = vi.fn();
    fixture.componentInstance.ended.subscribe(ended);
    fixture.componentInstance.onEnded();
    expect(fixture.componentInstance.error()).toContain('interrompida');
    expect(ended).not.toHaveBeenCalled();
    fixture.destroy();
  });

  it('keeps the total timeline inside the video container with no iframe or duplicate native timeline', async () => {
    const fixture = await create();
    const root: HTMLElement = fixture.nativeElement;
    expect(
      root
        .querySelector('input[aria-label="Posição no tempo total do vídeo"]')
        ?.closest('.cinema-player'),
    ).toBeTruthy();
    expect(root.querySelector('video')?.hasAttribute('controls')).toBe(false);
    expect(root.querySelector('iframe')).toBeNull();
    expect(root.textContent).toContain('1:00:00');
  });
  it('renders subtitle cues on the video and clears them after changing the source', async () => {
    vi.stubGlobal(
      'VTTCue',
      class {
        constructor(
          readonly startTime: number,
          readonly endTime: number,
          readonly text: string,
        ) {}
      },
    );
    const cues: unknown[] = [];
    const track = {
      mode: 'disabled',
      cues,
      addCue: vi.fn((cue) => cues.push(cue)),
      removeCue: vi.fn((cue) => cues.splice(cues.indexOf(cue), 1)),
    };
    vi.spyOn(HTMLMediaElement.prototype, 'addTextTrack').mockReturnValue(
      track as unknown as TextTrack,
    );
    const fixture = await create();
    fixture.componentRef.setInput('subtitleCues', [{ start: 1, end: 3, text: 'Olá' }]);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(track.mode).toBe('showing');
    expect(cues).toHaveLength(1);
    fixture.componentRef.setInput('subtitleCues', []);
    fixture.componentRef.setInput('playback', {
      ...session,
      media_url: session.media_url + '?new',
      offset: 60,
    });
    fixture.detectChanges();
    await fixture.whenStable();
    expect(cues).toHaveLength(0);
    fixture.componentInstance.position.set(75);
    fixture.componentInstance.paused.set(true);
    const requested = vi.fn();
    fixture.componentInstance.tracksRequested.subscribe(requested);
    fixture.componentInstance.selectTracks({ audio_index: 2, subtitle_index: null });
    expect(requested).toHaveBeenCalledWith({
      audio_index: 2,
      subtitle_index: null,
      seconds: 75,
      resume: false,
    });
  });
  it('applies subtitle appearance instantly and saves it without reloading the video', async () => {
    const fixture = await create();
    const load = vi.mocked(HTMLMediaElement.prototype.load);
    load.mockClear();
    const root = fixture.nativeElement as HTMLElement;
    const change = (label: string, value: string) => {
      const select = root.querySelector(`select[aria-label="${label}"]`) as HTMLSelectElement;
      select.value = value;
      select.dispatchEvent(new Event('change'));
    };
    change('Tamanho da legenda', 'large');
    change('Cor da legenda', 'yellow');
    change('Fundo da legenda', 'none');
    const outline = root.querySelector('subtitle-appearance-settings input') as HTMLInputElement;
    outline.checked = false;
    outline.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    await fixture.whenStable();
    const video = root.querySelector('video')!;
    expect(video.classList.contains('caption-size-large')).toBe(true);
    expect(video.classList.contains('caption-color-yellow')).toBe(true);
    expect(video.classList.contains('caption-bg-none')).toBe(true);
    expect(video.classList.contains('caption-outline-off')).toBe(true);
    expect(root.querySelector('.caption-preview')!.classList.contains('caption-color-yellow')).toBe(
      true,
    );
    expect(new SubtitleAppearanceStore().settings()).toEqual({
      size: 'large',
      color: 'yellow',
      background: 'none',
      outline: false,
    });
    expect(load).not.toHaveBeenCalled();
    (root.querySelector('subtitle-appearance-settings button') as HTMLButtonElement).click();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(video.classList.contains('caption-size-medium')).toBe(true);
    expect(video.classList.contains('caption-color-white')).toBe(true);
    expect(load).not.toHaveBeenCalled();
  });
  it('enters fullscreen with the whole player including its controls', async () => {
    const fixture = await create();
    const root: HTMLElement = fixture.nativeElement.querySelector('.cinema-player');
    const request = vi.fn().mockResolvedValue(undefined);
    root.requestFullscreen = request;
    await fixture.componentInstance.toggleFullscreen();
    expect(request).toHaveBeenCalledOnce();
  });
  it('requests an unavailable minute from the server and confirms the real absolute playback position', async () => {
    const fixture = await create();
    const component = fixture.componentInstance;
    const video = fixture.nativeElement.querySelector('video') as HTMLVideoElement;
    Object.defineProperty(video, 'seekable', {
      configurable: true,
      value: { length: 1, start: () => 0, end: () => 20 },
    });
    const requested = vi.fn();
    component.seekRequested.subscribe(requested);
    component.seek(1800);
    expect(requested).toHaveBeenCalledWith({ seconds: 1800, resume: false });
    expect(component.position()).toBe(0);
    expect(component.pending()).toBe(1800);
    fixture.componentRef.setInput('playback', {
      ...session,
      media_url: 'http://127.0.0.1:9000/media/new/compat.mp4',
      offset: 1800,
    });
    fixture.detectChanges();
    await fixture.whenStable();
    Object.defineProperty(video, 'readyState', { configurable: true, value: 2 });
    Object.defineProperty(video, 'seeking', { configurable: true, value: false });
    video.currentTime = 12;
    component.onTime();
    expect(component.position()).toBe(1812);
    video.currentTime = 0;
    component.onTime();
    expect(component.pending()).toBeNull();
    expect(component.position()).toBe(1800);
  });
  async function nextPrompt() {
    const fixture = await create();
    fixture.componentRef.setInput('nextEpisode', { ...session.item, id: '102', episode: '2' });
    fixture.detectChanges();
    vi.useFakeTimers();
    const component = fixture.componentInstance;
    component.position.set(3570);
    component.loading.set(false);
    component.paused.set(false);
    fixture.detectChanges();
    return fixture;
  }
  it('fills the rectangular button over five seconds and advances only once', async () => {
    const fixture = await nextPrompt(),
      component = fixture.componentInstance;
    const next = vi.fn();
    component.nextRequested.subscribe(next);
    expect(
      fixture.nativeElement.querySelector('.next-episode-button')?.closest('.cinema-player'),
    ).toBeTruthy();
    vi.advanceTimersByTime(2500);
    expect(component.nextUp.progress()).toBeCloseTo(50);
    expect(next).not.toHaveBeenCalled();
    vi.advanceTimersByTime(2500);
    expect(next).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(10000);
    expect(next).toHaveBeenCalledOnce();
  });
  it('cancels on mouse movement and keeps the button available for manual playback', async () => {
    const fixture = await nextPrompt(),
      component = fixture.componentInstance;
    const next = vi.fn(),
      cancelled = vi.fn();
    component.nextRequested.subscribe(next);
    component.automaticNextCancelled.subscribe(cancelled);
    vi.advanceTimersByTime(2000);
    document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }));
    fixture.detectChanges();
    vi.advanceTimersByTime(10000);
    expect(next).not.toHaveBeenCalled();
    expect(cancelled).toHaveBeenCalledOnce();
    expect(component.nextUp.progress()).toBe(0);
    component.position.set(3600);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.next-episode-button')).toBeTruthy();
    fixture.nativeElement.querySelector('.next-episode-button').click();
    expect(next).toHaveBeenCalledOnce();
  });
  it('does not offer a next episode before the final thirty seconds or on the last episode', async () => {
    const fixture = await create(),
      component = fixture.componentInstance;
    fixture.componentRef.setInput('nextEpisode', { ...session.item, id: '102' });
    component.position.set(3569);
    fixture.detectChanges();
    expect(component.nextUp.visible()).toBe(false);
    component.position.set(3570);
    fixture.detectChanges();
    expect(component.nextUp.visible()).toBe(true);
    fixture.componentRef.setInput('nextEpisode', null);
    fixture.detectChanges();
    expect(component.nextUp.visible()).toBe(false);
  });
  it('finishes the five-second fill even if the video ends during the countdown', async () => {
    const fixture = await nextPrompt(),
      component = fixture.componentInstance;
    const next = vi.fn(),
      ended = vi.fn();
    component.nextRequested.subscribe(next);
    component.ended.subscribe(ended);
    vi.advanceTimersByTime(1000);
    component.position.set(3599);
    component.onEnded();
    fixture.detectChanges();
    expect(ended).not.toHaveBeenCalled();
    vi.advanceTimersByTime(3999);
    expect(next).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(next).toHaveBeenCalledOnce();
  });
});
