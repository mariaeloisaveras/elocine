import {
  Component,
  ElementRef,
  HostListener,
  computed,
  inject,
  input,
  output,
  viewChild,
} from '@angular/core';
import { SubtitleAppearanceSettings } from './subtitle-appearance';
import { MediaTrack } from '../../domain/media';

@Component({
  selector: 'track-menu',
  standalone: true,
  imports: [SubtitleAppearanceSettings],
  template: `
    <details #menu class="track-menu" (keydown.escape)="close($event, menu)">
      <summary aria-label="Selecionar áudio e legendas">
        <span class="full-label">Áudio e legendas</span><span class="short-label">Áudio/CC</span>
      </summary>
      <div class="track-options">
        <h3>Áudio e legendas</h3>
        @if (!compatibility()) {
          <p>Ative a compatibilidade máxima em Reprodução para selecionar as faixas.</p>
        } @else if (!ready()) {
          <p role="status">Detectando faixas do vídeo…</p>
        } @else {
          <label
            >Áudio<select
              [value]="audio() ?? -1"
              [disabled]="busy() || !audios().length"
              (change)="choose('audio', $event)"
            >
              <option value="-1">Padrão do vídeo</option>
              @for (track of audios(); track track.index) {
                <option [value]="track.index">{{ label(track) }}</option>
              }
            </select></label
          >
          @if (!audios().length) {
            <p>Não há faixa de áudio identificada.</p>
          }
          <label
            >Legendas<select
              [value]="subtitle() ?? -1"
              [disabled]="busy()"
              (change)="choose('subtitle', $event)"
            >
              <option value="-1">Desativadas</option>
              @for (track of subtitles(); track track.index) {
                <option [value]="track.index" [disabled]="!track.supported">
                  {{ label(track)
                  }}{{ track.supported ? '' : ' · Formato de imagem não suportado' }}
                </option>
              }
            </select></label
          >
          @if (!subtitles().length) {
            <p>Este vídeo não oferece faixas separadas de legenda.</p>
          }
          <p>
            A troca recarrega o vídeo no ponto atual. Legendas fixas na imagem não podem ser
            desativadas.
          </p>
        }
        <subtitle-appearance-settings />
      </div>
    </details>
  `,
  styles: `
    :host {
      position: relative;
      display: block;
      font-size: 12px;
    }
    .short-label {
      display: none;
    }
    summary {
      cursor: pointer;
      list-style: none;
      white-space: nowrap;
      padding: 10px 7px;
    }
    summary::-webkit-details-marker {
      display: none;
    }
    .track-options {
      position: absolute;
      bottom: 48px;
      right: 0;
      width: min(310px, 75vw);
      max-height: clamp(100px, calc(56.25cqw - 110px), 60vh);
      overflow: auto;
      padding: 18px;
      background: #19191bf5;
      border: 1px solid #ffffff30;
      border-radius: 7px;
      box-shadow: 0 6px 25px #0009;
      z-index: 10;
    }
    h3 {
      font-size: 15px;
      margin: 0 0 16px;
    }
    label {
      display: block;
      color: #ddd;
      margin-bottom: 14px;
    }
    select {
      display: block;
      width: 100%;
      background: #29292d;
      color: #fff;
      padding: 9px;
      border: 1px solid #ffffff30;
      border-radius: 4px;
      margin-top: 7px;
      max-width: 100%;
    }
    p {
      font-size: 11px;
      line-height: 1.5;
      color: #aaa;
      margin: 10px 0 0;
    }
    :host-context(.cinema-player:fullscreen) .track-options {
      max-height: min(60vh, calc(100vh - 120px));
    }
    @media (max-width: 600px) {
      .full-label {
        display: none;
      }
      .short-label {
        display: inline;
      }
      summary {
        font-size: 10px;
        padding: 8px 3px;
      }
      .track-options {
        padding: 12px;
        max-height: clamp(100px, calc(62.5cqw - 95px), 60vh);
      }
    }
  `,
})
export class TrackMenu {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly menu = viewChild<ElementRef<HTMLDetailsElement>>('menu');
  @HostListener('document:click', ['$event'])
  onOutsideClick(event: MouseEvent) {
    const menu = this.menu()?.nativeElement;
    if (menu?.open && !event.composedPath().includes(this.host.nativeElement)) {
      menu.open = false;
    }
  }
  readonly tracks = input<MediaTrack[]>([]);
  readonly ready = input(false);
  readonly compatibility = input(true);
  readonly busy = input(false);
  readonly audio = input<number | null>(null);
  readonly subtitle = input<number | null>(null);
  readonly selection = output<{ audio_index: number | null; subtitle_index: number | null }>();
  readonly audios = computed(() => this.tracks().filter((track) => track.kind === 'audio'));
  readonly subtitles = computed(() => this.tracks().filter((track) => track.kind === 'subtitle'));
  label(track: MediaTrack) {
    const aliases: Record<string, string> = {
      por: 'pt',
      eng: 'en',
      spa: 'es',
      fre: 'fr',
      fra: 'fr',
      ger: 'de',
      deu: 'de',
      ita: 'it',
      jpn: 'ja',
      kor: 'ko',
      rus: 'ru',
      zho: 'zh',
      chi: 'zh',
    };
    let name = 'Idioma não informado';
    if (track.language !== 'und') {
      try {
        name =
          new Intl.DisplayNames(['pt-BR'], { type: 'language' }).of(
            aliases[track.language] || track.language,
          ) || name;
      } catch {}
    }
    return `${name} · Faixa ${track.index}`;
  }
  close(event: Event, menu: HTMLDetailsElement) {
    event.stopPropagation();
    menu.open = false;
    menu.querySelector('summary')?.focus();
  }
  choose(kind: 'audio' | 'subtitle', event: Event) {
    const value = Number((event.target as HTMLSelectElement).value);
    const index = value < 0 ? null : value;
    this.selection.emit({
      audio_index: kind === 'audio' ? index : this.audio(),
      subtitle_index: kind === 'subtitle' ? index : this.subtitle(),
    });
  }
}
