import { Component, computed, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MediaItem } from '../../domain/media';
import { routeFor } from '../../domain/time';
import { LiveGuide } from './live-guide';
import { Icon } from './icon';
@Component({
  selector: 'media-card',
  standalone: true,
  imports: [RouterLink, Icon, LiveGuide],
  styleUrl: './media-card.css',
  template: `
    <a
      class="media-card"
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
    @if (item().kind === 'live') {
      <live-guide [channel]="item().id" />
    }
  `,
})
export class MediaCard {
  item = input.required<MediaItem>();
  wide = input(false);
  progress = input(0);
  failed = signal(false);
  link = computed(() => routeFor(this.item()));
}
