import {
  Component,
  DestroyRef,
  HostListener,
  OnDestroy,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { Title } from '@angular/platform-browser';
import { CatalogUseCases } from '../../application/catalog.use-cases';
import { PlaybackUseCases } from '../../application/playback.use-cases';
import {
  CatalogKind,
  Details,
  DownloadProgress,
  MediaItem,
  Playback,
  SubtitleCue,
  TrackSelection,
} from '../../domain/media';
import { formatTime } from '../../domain/time';
import { LibraryStore } from '../../infrastructure/library.store';
import { Icon } from '../shared/icon';
import { LibraryActions } from '../shared/library-actions';
import { VideoPlayer } from './video-player';

@Component({
  standalone: true,
  imports: [Icon, VideoPlayer, LibraryActions],
  templateUrl: './watch.page.html',
  styleUrl: './watch.page.css',
})
export class WatchPage implements OnDestroy {
  readonly library = inject(LibraryStore);
  private readonly catalog = inject(CatalogUseCases);
  private readonly playback = inject(PlaybackUseCases);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly destroy = inject(DestroyRef);
  private readonly title = inject(Title);
  readonly details = signal<Details | null>(null);
  readonly selected = signal<MediaItem | null>(null);
  readonly session = signal<Playback | null>(null);
  readonly loading = signal(true);
  readonly switching = signal(false);
  readonly error = signal('');
  readonly streamError = signal('');
  readonly showEpisodes = signal(true);
  readonly progress = signal<DownloadProgress | null>(null);
  readonly subtitleCues = signal<SubtitleCue[]>([]);
  private subtitleCursor = 0;
  readonly season = signal('');
  readonly autoplay = signal(true);
  readonly automaticNextCancelled = signal(false);
  readonly seasons = computed(() => [
    ...new Set(this.details()?.episodes.map((e) => e.season) || []),
  ]);
  readonly episodes = computed(
    () => this.details()?.episodes.filter((e) => e.season === this.season()) || [],
  );
  readonly next = computed(() => {
    const items = this.details()?.episodes || [];
    const index = items.findIndex((e) => e.id === this.selected()?.id);
    return index >= 0 ? items[index + 1] : undefined;
  });
  private endsSeason() {
    const selected = this.selected();
    const next = this.next();
    return !!selected && (!next || next.season !== selected.season);
  }
  readonly format = formatTime;
  private abort?: AbortController;
  private generation = 0;
  private timer?: ReturnType<typeof setInterval>;
  private polling = false;
  private actualPosition = 0;
  private actualDuration = 0;
  private queuedSeek: { seconds: number; resume: boolean; revision: number } | null = null;
  private seeking = false;
  private playbackRevision = 0;
  private completed = false;
  constructor() {
    this.route.paramMap.pipe(takeUntilDestroyed(this.destroy)).subscribe((params) => {
      const kind = params.get('kind'),
        id = params.get('id');
      if (!id || !['movie', 'series', 'live'].includes(kind || '')) {
        void this.router.navigate(['/']);
        return;
      }
      void this.load(kind as CatalogKind, id);
    });
  }
  async load(kind: CatalogKind, id: string) {
    const generation = ++this.generation;
    this.abort?.abort();
    this.abort = new AbortController();
    this.release();
    this.loading.set(true);
    this.error.set('');
    this.streamError.set('');
    try {
      const details = await this.catalog.details(kind, id, this.abort.signal);
      if (generation !== this.generation) return;
      this.details.set(details);
      this.title.setTitle(details.item.title + ' — Elocine');
      const history = this.library.resume(details.item);
      const requested = this.route.snapshot.queryParamMap.get('episode');
      const item =
        kind === 'series'
          ? details.episodes.find((e) => e.id === requested) ||
            details.episodes.find((e) => e.id === history?.item.id) ||
            details.episodes[0]
          : details.item;
      if (!item) {
        this.error.set('Esta série ainda não tem episódios disponíveis.');
        return;
      }
      this.season.set(item.season);
      await this.start(item, history?.item.id === item.id ? history.position : 0);
    } catch (error) {
      if (generation === this.generation && (error as Error).name !== 'AbortError')
        this.error.set((error as Error).message);
    } finally {
      if (generation === this.generation) this.loading.set(false);
    }
  }
  async start(item: MediaItem, offset = 0) {
    const generation = this.generation,
      revision = ++this.playbackRevision;
    this.save(true);
    this.release(false);
    this.completed = false;
    if (this.selected()?.id !== item.id) this.automaticNextCancelled.set(false);
    this.selected.set(item);
    this.actualPosition = offset;
    this.actualDuration = item.duration;
    this.switching.set(true);
    this.error.set('');
    this.streamError.set('');
    this.progress.set(null);
    this.subtitleCues.set([]);
    this.subtitleCursor = 0;
    this.autoplay.set(true);
    try {
      const session = await this.playback.start(
        item,
        this.library.compatibility(),
        offset,
        this.abort?.signal,
      );
      if (generation !== this.generation || revision !== this.playbackRevision) {
        this.playback.release(session.id);
        return;
      }
      this.session.set(session);
      this.timer = setInterval(() => void this.poll(), 1500);
      void this.poll();
    } catch (error) {
      if (
        generation === this.generation &&
        revision === this.playbackRevision &&
        (error as Error).name !== 'AbortError'
      )
        this.error.set((error as Error).message);
    } finally {
      if (generation === this.generation && revision === this.playbackRevision)
        this.switching.set(false);
    }
  }
  async poll() {
    const session = this.session();
    if (!session || this.polling) return;
    this.polling = true;
    try {
      const progress = await this.playback.progress(session.id);
      if (this.session()?.media_url === session.media_url) {
        this.progress.set(progress);
        if (progress.error) this.streamError.set(progress.error);
        if (session.subtitle_index !== null && session.subtitle_index !== undefined) {
          const batch = await this.playback.subtitles(session.id, this.subtitleCursor);
          if (this.session()?.media_url === session.media_url) {
            this.subtitleCues.update((cues) => [...cues, ...batch.cues]);
            this.subtitleCursor = batch.cursor;
          }
        }
      }
    } catch (error) {
      if (this.session()?.media_url === session.media_url)
        this.streamError.set((error as Error).message);
    } finally {
      this.polling = false;
    }
  }
  async seek(request: { seconds: number; resume: boolean }) {
    this.queuedSeek = { ...request, revision: this.playbackRevision };
    if (this.seeking) return;
    this.seeking = true;
    const generation = this.generation;
    let revision = this.playbackRevision;
    try {
      while (this.queuedSeek && generation === this.generation) {
        const next = this.queuedSeek;
        this.queuedSeek = null;
        if (next.revision !== this.playbackRevision) continue;
        revision = next.revision;
        const active = this.session();
        if (!active) break;
        const session = await this.playback.seek(active.id, next.seconds);
        if (generation !== this.generation) return;
        if (revision !== this.playbackRevision || this.session()?.id !== active.id) continue;
        if (!this.queuedSeek) {
          this.autoplay.set(next.resume);
          this.subtitleCues.set([]);
          this.subtitleCursor = 0;
          this.session.set(session);
          this.streamError.set('');
        }
      }
    } catch (error) {
      if (generation === this.generation && revision === this.playbackRevision)
        this.streamError.set((error as Error).message);
    } finally {
      this.seeking = false;
      const queued = this.queuedSeek;
      if (queued && queued.revision === this.playbackRevision && generation === this.generation)
        void this.seek(queued);
    }
  }
  async selectTracks(request: TrackSelection & { resume: boolean }) {
    const active = this.session();
    if (!active || this.switching() || this.seeking) return;
    const generation = this.generation;
    const revision = ++this.playbackRevision;
    this.switching.set(true);
    this.streamError.set('');
    try {
      const session = await this.playback.selectTracks(active.id, request);
      if (generation !== this.generation || revision !== this.playbackRevision) return;
      this.autoplay.set(request.resume);
      this.subtitleCues.set([]);
      this.subtitleCursor = 0;
      this.session.set(session);
    } catch (error) {
      if (generation === this.generation && revision === this.playbackRevision)
        this.streamError.set((error as Error).message);
    } finally {
      if (generation === this.generation && revision === this.playbackRevision)
        this.switching.set(false);
    }
  }
  onPosition(value: { position: number; duration: number }) {
    this.actualPosition = value.position;
    this.actualDuration = value.duration;
    this.save();
  }
  private save(force = false) {
    const item = this.selected(),
      parent = this.details()?.item;
    if (!this.completed && item && parent)
      this.library.remember(
        item,
        parent,
        this.actualPosition,
        this.actualDuration,
        force,
        parent.kind === 'series' && this.endsSeason(),
      );
  }
  private release(clear = true) {
    clearInterval(this.timer);
    this.queuedSeek = null;
    const session = this.session();
    if (session) {
      this.playback.release(session.id);
      if (clear) this.session.set(null);
    }
  }
  chooseEpisode(item: MediaItem) {
    if (this.switching()) return;
    this.season.set(item.season);
    return this.start(item);
  }
  selectSeason(event: Event) {
    this.season.set((event.target as HTMLSelectElement).value);
  }
  setCompatibility(event: Event) {
    this.library.setCompatibility((event.target as HTMLInputElement).checked);
    const item = this.selected();
    if (item) void this.start(item, this.actualPosition);
  }
  retry() {
    const item = this.selected();
    if (item) void this.start(item, this.actualPosition);
    else {
      const params = this.route.snapshot.paramMap;
      void this.load(params.get('kind') as CatalogKind, params.get('id')!);
    }
  }
  onEnded() {
    if (this.switching() || this.completed || !this.selected()) return;
    this.completed = true;
    const item = this.details()?.item;
    const next = this.next();
    if (item) {
      if (item.kind === 'movie' || this.endsSeason()) this.library.finish(item);
      else this.library.forget(item);
    }
    if (next && !this.automaticNextCancelled()) return this.chooseEpisode(next);
  }
  cancelAutomaticNext() {
    this.automaticNextCancelled.set(true);
  }
  playNext() {
    const next = this.next();
    if (!this.switching() && next) return this.chooseEpisode(next);
  }
  async back() {
    this.save(true);
    const session = this.session();
    if (session) {
      void this.playback.stop(session.id).catch(() => {});
      this.session.set(null);
    }
    await this.router.navigateByUrl(this.library.lastCatalogUrl || '/');
  }
  @HostListener('window:pagehide') onPageHide() {
    this.save(true);
    this.release();
  }
  ngOnDestroy() {
    ++this.generation;
    this.abort?.abort();
    this.save(true);
    this.release();
    this.title.setTitle('Elocine — Seu próximo play');
  }
  percent() {
    const progress = this.progress();
    return progress?.total
      ? Math.min(100, Math.round((progress.size / progress.total) * 100))
      : null;
  }
  megabytes() {
    return ((this.progress()?.size || 0) / 1048576).toFixed(1);
  }
}
