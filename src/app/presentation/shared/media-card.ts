import {
  Component,
  ChangeDetectorRef,
  DestroyRef,
  ElementRef,
  HostListener,
  computed,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { CatalogUseCases } from '../../application/catalog.use-cases';
import { RouterLink } from '@angular/router';
import { MediaItem } from '../../domain/media';
import { routeFor } from '../../domain/time';
import { LiveGuide } from './live-guide';
import { LibraryStore } from '../../infrastructure/library.store';
import { LibraryActions } from './library-actions';
import { Icon } from './icon';
@Component({
  selector: 'media-card',
  standalone: true,
  imports: [RouterLink, Icon, LiveGuide, LibraryActions],
  styleUrl: './media-card.css',
  template: `
    <a
      #anchor
      class="media-card"
      (pointerenter)="enter($event)"
      (pointerleave)="scheduleClose()"
      (focus)="scheduleOpen()"
      (blur)="scheduleClose()"
      [class.wide]="wide()"
      [class.channel]="item().kind === 'live'"
      [routerLink]="link()"
      [attr.aria-label]="'Assistir ' + item().title"
    >
      @if (item().artwork && !failed()) {
        <img
          [src]="item().artwork"
          alt=""
          loading="lazy"
          decoding="async"
          (error)="failed.set(true)"
        />
      } @else {
        <div class="art-placeholder">
          <span>{{ item().title.slice(0, 1) }}</span>
        </div>
      }
      @if (item().kind === 'live') {
        <span class="live-tag">AO VIVO</span>
      }
      <span class="card-play"><ui-icon name="play" /></span>
      <div class="card-caption">
        <strong>{{ item().title }}</strong><span
          >{{ item().kind === 'series' ? 'Série' : item().kind === 'live' ? 'Canal' : 'Filme' }}
          @if (item().year) {
            · {{ item().year }}
          }
        </span>
      </div>
      @if (progress() > 0) {
        <span class="card-progress"><span [style.width.%]="progress()"></span></span>
      }
    </a>
    <section
      #preview
      popover="auto"
      class="media-preview"
      [class.series-preview]="item().kind === 'series'"
      role="dialog"
      [attr.aria-label]="'Prévia de ' + item().title"
      (pointerenter)="cancelClose()"
      (pointerleave)="scheduleClose()"
      (focusin)="cancelClose()"
      (focusout)="scheduleClose()"
      (toggle)="onToggle($event)"
    >
      @if (opened()) {
        <div class="preview-visual">
          @if (trailerUrl(); as url) {
            <iframe
              [src]="url"
              [title]="'Trailer de ' + item().title"
              allow="autoplay; encrypted-media; picture-in-picture"
              allowfullscreen
            ></iframe>
          } @else if (previewImage()) {
            <img [src]="previewImage()" [alt]="item().title" />
          }
          @if (previewProgress() > 0) {
            <span
              class="preview-progress"
              role="progressbar"
              [attr.aria-label]="
                item().kind === 'series' ? 'Progresso do último episódio' : 'Progresso do filme'
              "
              [attr.aria-valuenow]="previewProgress()"
              aria-valuemin="0"
              aria-valuemax="100"
            >
              <span [style.width.%]="previewProgress()"></span>
            </span>
          }
          <button class="preview-close" aria-label="Fechar prévia" (click)="close()">
            <ui-icon name="close" />
          </button>
        </div>
        <div class="preview-body">
          <h3>{{ detail().title }}</h3>
          <div class="preview-meta">
            <span>{{
              item().kind === 'series' ? 'Série' : item().kind === 'live' ? 'Ao vivo' : 'Filme'
            }}</span>
            @if (detail().year) {
              <span>{{ detail().year }}</span>
            }
            @if (detail().rating) {
              <span>★ {{ detail().rating }}</span>
            }
            @if (detail().genre) {
              <span>{{ detail().genre }}</span>
            }
          </div>
          <p>
            {{
              detail().synopsis ||
                (loading() ? 'Carregando descrição…' : 'Descrição não disponível para este título.')
            }}
          </p>
          @if (detail().cast) {
            <p class="preview-cast">Elenco: {{ detail().cast }}</p>
          }
          <a class="preview-watch" [routerLink]="link()" (click)="close()"
            ><ui-icon name="play" /> Assistir</a
          >
          <library-actions [item]="detail()" />
          @if (item().kind === 'series') {
            <div class="preview-episodes">
              <div class="preview-episode-heading">
                <h4>Episódios</h4>
                @if (seasons().length) {
                  <select
                    aria-label="Temporada"
                    [value]="selectedSeason()"
                    (change)="selectSeason($event)"
                  >
                    @for (season of seasons(); track season) {
                      <option [value]="season">Temporada {{ season || '1' }}</option>
                    }
                  </select>
                }
              </div>
              @if (loading()) {
                <p role="status">Carregando episódios…</p>
              } @else {
                <div class="preview-episode-list">
                  @for (episode of seasonEpisodes(); track episode.id) {
                    <a
                      class="preview-episode"
                      [routerLink]="link()"
                      [queryParams]="{ episode: episode.id }"
                      (click)="close()"
                    >
                      <span class="episode-number">{{ episode.episode || $index + 1 }}</span>
                      @if (episode.artwork) {
                        <img [src]="episode.artwork" alt="" loading="lazy" />
                      }
                      <span class="episode-info">
                        <strong>{{ episode.title }}</strong>
                        @if (episode.duration > 0) {
                          <small>{{ episodeMinutes(episode.duration) }} min</small>
                        }
                        @if (episode.synopsis) {
                          <span>{{ episode.synopsis }}</span>
                        }
                      </span>
                      <ui-icon name="play" />
                      @if (library.episodeProgress(episode, item().id) > 0) {
                        <span
                          class="episode-watch-progress"
                          role="progressbar"
                          [attr.aria-label]="'Progresso de ' + episode.title"
                          [attr.aria-valuenow]="library.episodeProgress(episode, item().id)"
                          aria-valuemin="0"
                          aria-valuemax="100"
                        >
                          <span
                            [style.width.%]="library.episodeProgress(episode, item().id)"
                          ></span>
                        </span>
                      }
                    </a>
                  } @empty {
                    <p>Episódios não disponíveis para esta série.</p>
                  }
                </div>
              }
            </div>
          }
        </div>
      }
    </section>
    @if (item().kind === 'live') {
      <live-guide [channel]="item().id" />
    }
  `,
})
export class MediaCard {
  readonly library = inject(LibraryStore);
  item = input.required<MediaItem>();
  wide = input(false);
  progress = input(0);
  failed = signal(false);
  private readonly changeDetector = inject(ChangeDetectorRef);
  private readonly catalog = inject(CatalogUseCases, { optional: true });
  private readonly sanitizer = inject(DomSanitizer);
  private readonly anchor = viewChild<ElementRef<HTMLElement>>('anchor');
  private readonly preview = viewChild<ElementRef<HTMLElement>>('preview');
  readonly previewProgress = computed(() => {
    if (this.progress() > 0) return Math.min(100, this.progress());
    const entry = this.library.resume(this.item());
    if (entry?.duration) return Math.min(100, (entry.position / entry.duration) * 100);
    if (
      this.item().kind === 'movie' &&
      this.library.completed().some((item) => item.kind === 'movie' && item.id === this.item().id)
    )
      return 100;
    return 0;
  });
  readonly opened = signal(false);
  readonly loading = signal(false);
  readonly episodes = signal<MediaItem[]>([]);
  readonly selectedSeason = signal('');
  readonly seasons = computed(() =>
    [...new Set(this.episodes().map((episode) => episode.season))].sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true }),
    ),
  );
  readonly seasonEpisodes = computed(() =>
    this.episodes()
      .filter((episode) => episode.season === this.selectedSeason())
      .sort((a, b) => a.episode.localeCompare(b.episode, undefined, { numeric: true })),
  );
  selectSeason(event: Event) {
    this.selectedSeason.set((event.target as HTMLSelectElement).value);
  }
  episodeMinutes(duration: number) {
    return Math.max(1, Math.round(duration / 60));
  }

  private readonly loaded = signal<MediaItem | null>(null);
  readonly detail = computed(() => this.loaded() || this.item());
  readonly previewImage = computed(
    () =>
      this.detail().backdrop ||
      this.detail().artwork ||
      this.item().backdrop ||
      this.item().artwork,
  );
  readonly trailerUrl = computed(() => {
    const value = this.detail().trailer?.trim() || '';
    let id = /^[a-zA-Z0-9_-]{11}$/.test(value) ? value : '';
    if (!id && value) {
      try {
        const url = new URL(value);
        if (url.hostname === 'youtu.be') id = url.pathname.slice(1).split('/')[0];
        else if (['youtube.com', 'www.youtube.com', 'm.youtube.com'].includes(url.hostname))
          id =
            url.searchParams.get('v') ||
            url.pathname.match(/^\/(?:embed|shorts)\/([^/]+)/)?.[1] ||
            '';
      } catch {
        /* A missing or unsupported trailer keeps the artwork visible. */
      }
    }
    return /^[a-zA-Z0-9_-]{11}$/.test(id)
      ? this.sanitizer.bypassSecurityTrustResourceUrl(
          'https://www.youtube-nocookie.com/embed/' + id + '?autoplay=1&mute=1&playsinline=1&rel=0',
        )
      : null;
  });
  private closeTimer?: ReturnType<typeof setTimeout>;
  private request?: AbortController;
  constructor() {
    inject(DestroyRef).onDestroy(() => {
      clearTimeout(this.closeTimer);
      this.request?.abort();
    });
  }
  enter(event: PointerEvent) {
    if (event.pointerType !== 'touch') this.scheduleOpen();
  }
  scheduleOpen() {
    if (this.item().kind === 'live') return;
    this.cancelClose();
    if (!this.opened()) this.open();
  }
  cancelClose() {
    clearTimeout(this.closeTimer);
  }
  scheduleClose() {
    this.cancelClose();
    this.closeTimer = setTimeout(() => this.close(), 180);
  }
  private open() {
    const panel = this.preview()?.nativeElement;
    const bounds = this.anchor()?.nativeElement.getBoundingClientRect();
    if (!panel || !bounds || !panel.showPopover) return;
    const width = Math.min(this.item().kind === 'series' ? 560 : 390, window.innerWidth - 24);
    panel.style.width = width + 'px';
    panel.style.left =
      Math.max(
        12,
        Math.min(bounds.left + bounds.width / 2 - width / 2, window.innerWidth - width - 12),
      ) + 'px';
    this.opened.set(true);
    this.changeDetector.detectChanges();
    panel.showPopover();
    panel.style.top =
      Math.max(
        12,
        Math.min(
          bounds.top - 28,
          window.innerHeight -
            (this.item().kind === 'series'
              ? Math.min(760, window.innerHeight - 24)
              : panel.getBoundingClientRect().height) -
            12,
        ),
      ) + 'px';
    const item = this.item();
    if (this.catalog && item.kind !== 'episode' && !this.loaded()) {
      this.request?.abort();
      const request = (this.request = new AbortController());
      this.loading.set(true);
      void this.catalog
        .details(item.kind, item.id, request.signal)
        .then((result) => {
          if (!request.signal.aborted) {
            this.loaded.set(result.item);
            this.episodes.set(result.episodes);
            this.selectedSeason.set(this.seasons()[0] || '');
          }
        })
        .catch(() => {})
        .finally(() => {
          if (!request.signal.aborted) this.loading.set(false);
        });
    }
  }
  close() {
    this.cancelClose();
    this.preview()?.nativeElement.hidePopover?.();
    this.opened.set(false);
  }
  onToggle(event: Event) {
    if ((event as ToggleEvent).newState === 'closed') this.opened.set(false);
  }
  @HostListener('window:resize')
  @HostListener('window:scroll')
  onWindowChange() {
    if (this.opened()) this.close();
  }
  link = computed(() => routeFor(this.item()));
}
