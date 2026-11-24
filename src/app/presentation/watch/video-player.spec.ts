import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VideoPlayer } from './video-player';
import { Playback } from '../../domain/media';

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
    vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
  });
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });
  async function create() {
    const fixture = TestBed.createComponent(VideoPlayer);
    fixture.componentRef.setInput('playback', session);
    fixture.detectChanges();
    await fixture.whenStable();
    return fixture;
  }
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
