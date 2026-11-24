import {
  Component,
  ElementRef,
  HostListener,
  OnDestroy,
  computed,
  effect,
  input,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import type Hls from 'hls.js';
import { MediaItem, Playback } from '../../domain/media';
import { clampPosition, formatTime } from '../../domain/time';
import { LiveGuide } from '../shared/live-guide';
import { Icon } from '../shared/icon';
import { NextEpisodeController, NEXT_EPISODE_WINDOW_SECONDS } from './next-episode.controller';

@Component({
  selector: 'video-player',
  standalone: true,
  imports: [Icon, LiveGuide],
  templateUrl: './video-player.html',
  styleUrl: './video-player.css',
})
export class VideoPlayer implements OnDestroy {
  readonly playback = input.required<Playback>();
  readonly title = input('');
  readonly subtitle = input('');
  readonly autoplay = input(true);
  readonly externalError = input('');
  readonly hasEpisodes = input(false);
  readonly nextEpisode = input<MediaItem | null>(null);
  readonly autoNextDisabled = input(false);
  readonly transitioning = input(false);
  readonly automaticNextCancelled = output<void>();
  readonly nextRequested = output<void>();
  readonly seekRequested = output<{ seconds: number; resume: boolean }>();
  readonly back = output<void>();
  readonly episodes = output<void>();
  readonly retry = output<void>();
  readonly ended = output<void>();
  readonly positionChange = output<{ position: number; duration: number }>();
  readonly video = viewChild<ElementRef<HTMLVideoElement>>('video');
  readonly container = viewChild<ElementRef<HTMLElement>>('container');
  readonly position = signal(0);
  readonly metadataDuration = signal(0);
  readonly paused = signal(true);
  readonly loading = signal(true);
  readonly pending = signal<number | null>(null);
  readonly error = signal('');
  readonly visible = signal(true);
  readonly muted = signal(false);
  readonly volume = signal(0.8);
  readonly scrubbing = signal(false);
  readonly preview = signal(0);
  readonly hoverTime = signal<number | null>(null);
  readonly tooltipTime = computed(() => (this.scrubbing() ? this.preview() : this.hoverTime()));
  readonly tooltipLeft = computed(
    () =>
      `clamp(40px, ${this.duration() ? ((this.tooltipTime() ?? 0) / this.duration()) * 100 : 0}%, calc(100% - 40px))`,
  );
  readonly fullscreen = signal(false);
  readonly played = computed(() =>
    this.duration() ? Math.min(100, (this.position() / this.duration()) * 100) : 0,
  );
  readonly duration = computed(() => this.playback().item.duration || this.metadataDuration());
  readonly isLive = computed(() => this.playback().item.kind === 'live');
  readonly value = computed(() =>
    this.scrubbing() ? this.preview() : (this.pending() ?? this.position()),
  );
  readonly problem = computed(() => this.externalError() || this.error());
  private readonly finished = signal(false);
  readonly nextUp = new NextEpisodeController({
    episodeKey: () => {
      const item = this.playback().item;
      return `${item.kind}:${item.parent_id}:${item.id}`;
    },
    eligible: () =>
      !!this.nextEpisode() &&
      this.playback().item.kind === 'episode' &&
      this.duration() > 0 &&
      this.position() >= this.duration() - NEXT_EPISODE_WINDOW_SECONDS &&
      !this.problem() &&
      !this.transitioning(),
    disabled: () => this.autoNextDisabled(),
    playing: () => !this.paused() || this.finished(),
    waiting: () => this.loading() || this.pending() !== null || this.scrubbing(),
    onAdvance: () => {
      this.video()?.nativeElement.pause();
      this.nextRequested.emit();
    },
    onCancel: () => this.automaticNextCancelled.emit(),
  });
  readonly format = formatTime;
  private hls?: Hls;
  private generation = 0;
  private hideTimer?: ReturnType<typeof setTimeout>;

  constructor() {
    effect(() => {
      const element = this.video()?.nativeElement;
      const playback = this.playback();
      if (element) untracked(() => void this.attach(element, playback));
    });
  }
  @HostListener('document:mousemove')
  cancelAutomaticNext() {
    this.nextUp.cancel();
  }
  private async attach(video: HTMLVideoElement, session: Playback) {
    const generation = ++this.generation;
    this.hls?.destroy();
    this.hls = undefined;
    video.pause();
    video.removeAttribute('src');
    video.load();
    this.position.set(session.offset);
    this.metadataDuration.set(0);
    this.loading.set(true);
    this.error.set('');
    this.finished.set(false);
    this.hoverTime.set(null);
    this.pending.set(session.offset > 0 ? session.offset : null);
    this.visible.set(true);
    video.volume = this.volume();
    video.muted = this.muted();
    if (session.is_hls) {
      try {
        const { default: HlsClass } = await import('hls.js');
        if (generation !== this.generation) return;
        if (HlsClass.isSupported()) {
          const hls = new HlsClass({
            maxBufferLength: this.isLive() ? 20 : 1800,
            maxMaxBufferLength: 86400,
            maxBufferSize: 512 * 1024 * 1024,
            backBufferLength: 60,
            manifestLoadingMaxRetry: 1,
          });
          this.hls = hls;
          hls.on(HlsClass.Events.ERROR, (_event, data) => {
            if (data.fatal) {
              this.error.set(
                'O stream não pôde ser carregado. Tente novamente ou ative a compatibilidade máxima.',
              );
              this.loading.set(false);
            }
          });
          hls.loadSource(session.media_url);
          hls.attachMedia(video);
        } else if (video.canPlayType('application/vnd.apple.mpegurl'))
          video.src = session.media_url;
        else
          this.error.set(
            'Este navegador não oferece suporte a este stream. Ative a compatibilidade máxima.',
          );
      } catch {
        this.error.set('Não foi possível iniciar o player. Tente novamente.');
      }
    } else video.src = session.media_url;
  }
  onMetadata() {
    const v = this.video()?.nativeElement;
    if (!v) return;
    this.onDuration();
    if (!this.playback().compatibility && this.playback().initial_position)
      v.currentTime = this.playback().initial_position!;
    if (this.autoplay()) void this.play();
    else this.loading.set(false);
  }
  onDuration() {
    const v = this.video()?.nativeElement;
    if (v && Number.isFinite(v.duration))
      this.metadataDuration.set(v.duration + this.playback().offset);
  }
  onTime() {
    const v = this.video()?.nativeElement;
    if (!v || !v.readyState) return;
    const actual = this.playback().offset + v.currentTime;
    this.position.set(actual);
    this.confirm();
    this.positionChange.emit({ position: actual, duration: this.duration() });
  }
  confirm() {
    const v = this.video()?.nativeElement;
    if (!v) return;
    if (
      this.pending() !== null &&
      !v.seeking &&
      v.readyState >= 2 &&
      Math.abs(v.currentTime + this.playback().offset - this.pending()!) < 1
    ) {
      this.pending.set(null);
      this.loading.set(false);
    }
  }
  onPlaying() {
    this.loading.set(false);
    this.paused.set(false);
    this.finished.set(false);
    this.confirm();
    this.reveal();
  }
  onPause() {
    this.paused.set(true);
    this.reveal();
  }
  onEnded() {
    this.onTime();
    this.loading.set(false);
    this.pending.set(null);
    this.paused.set(true);
    this.finished.set(true);
    this.reveal();
    if (this.nextUp.visible() && !this.nextUp.stopped() && !this.nextUp.triggered()) return;
    this.ended.emit();
  }
  onWaiting() {
    this.loading.set(true);
    this.visible.set(true);
  }
  onError() {
    if (!this.video()?.nativeElement.src) return;
    this.loading.set(false);
    this.error.set('Não foi possível reproduzir o vídeo. Feche outros players e tente novamente.');
  }
  async play() {
    try {
      await this.video()?.nativeElement.play();
    } catch (error) {
      this.loading.set(false);
      this.paused.set(true);
      if ((error as Error).name !== 'NotAllowedError')
        this.error.set('O vídeo não pôde ser iniciado. Tente novamente.');
    }
  }
  toggle() {
    const v = this.video()?.nativeElement;
    if (!v) return;
    if (v.paused) void this.play();
    else v.pause();
    this.reveal();
  }
  seek(seconds: number) {
    const v = this.video()?.nativeElement;
    if (!v || !this.duration() || this.isLive()) return;
    const target = clampPosition(seconds, this.duration()),
      relative = target - this.playback().offset;
    let local = false;
    for (let i = 0; i < v.seekable.length; i++) {
      if (relative >= v.seekable.start(i) && relative < v.seekable.end(i)) local = true;
    }
    this.pending.set(target);
    this.loading.set(true);
    this.reveal();
    if (this.playback().can_seek && !local) {
      const resume = !v.paused;
      v.pause();
      v.removeAttribute('src');
      v.load();
      this.seekRequested.emit({ seconds: target, resume });
    } else
      try {
        v.currentTime = relative;
        this.confirm();
      } catch {
        this.error.set('Este trecho ainda não está disponível. Tente a compatibilidade máxima.');
        this.loading.set(false);
        this.pending.set(null);
      }
  }
  skip(seconds: number) {
    this.seek((this.pending() ?? this.position()) + seconds);
  }
  previewSeek(event: Event) {
    this.scrubbing.set(true);
    this.preview.set(Number((event.target as HTMLInputElement).value));
    this.reveal();
  }
  commitSeek(event: Event) {
    this.scrubbing.set(false);
    this.seek(Number((event.target as HTMLInputElement).value));
  }
  hoverSeek(event: PointerEvent) {
    if (event.pointerType === 'touch' || !this.duration()) return;
    const bounds = (event.currentTarget as HTMLInputElement).getBoundingClientRect();
    if (bounds.width <= 0) return;
    this.hoverTime.set(
      Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)) * this.duration(),
    );
    this.reveal();
  }
  clearSeekHover() {
    this.hoverTime.set(null);
    this.reveal();
  }
  setVolume(event: Event) {
    const value = Number((event.target as HTMLInputElement).value);
    this.volume.set(value);
    this.muted.set(value === 0);
    const v = this.video()?.nativeElement;
    if (v) {
      v.volume = value;
      v.muted = value === 0;
    }
  }
  toggleMute() {
    this.muted.set(!this.muted());
    const v = this.video()?.nativeElement;
    if (v) v.muted = this.muted();
    this.reveal();
  }
  reveal() {
    this.visible.set(true);
    clearTimeout(this.hideTimer);
    if (!this.paused() && !this.loading() && !this.scrubbing())
      this.hideTimer = setTimeout(() => {
        if (
          !this.paused() &&
          !this.loading() &&
          !this.scrubbing() &&
          this.hoverTime() === null &&
          !this.container()?.nativeElement.querySelector(':focus-visible')
        )
          this.visible.set(false);
      }, 2800);
  }
  async toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await this.container()?.nativeElement.requestFullscreen();
    } catch {
      this.error.set('O navegador não permitiu abrir a tela cheia.');
    }
  }
  @HostListener('document:fullscreenchange') onFullscreen() {
    this.fullscreen.set(!!document.fullscreenElement);
    this.reveal();
  }
  @HostListener('document:keydown', ['$event']) onKey(event: KeyboardEvent) {
    const target = event.target as HTMLElement;
    if (
      event.ctrlKey ||
      event.altKey ||
      event.metaKey ||
      target.isContentEditable ||
      target.closest('input,textarea,select,button,a')
    )
      return;
    if (event.code === 'Space') {
      event.preventDefault();
      if (!event.repeat) this.toggle();
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      this.skip(event.key === 'ArrowRight' ? 10 : -10);
    } else if (event.key === 'Escape' && document.fullscreenElement) void document.exitFullscreen();
    else if (event.key.toLowerCase() === 'f') {
      event.preventDefault();
      void this.toggleFullscreen();
    }
    this.reveal();
  }
  ngOnDestroy() {
    ++this.generation;
    clearTimeout(this.hideTimer);
    this.hls?.destroy();
    const v = this.video()?.nativeElement;
    if (v) {
      v.pause();
      v.removeAttribute('src');
      v.load();
    }
  }
}
