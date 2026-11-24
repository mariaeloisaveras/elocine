import { Component, inject, input } from '@angular/core';
import { MediaItem } from '../../domain/media';
import { LibraryStore, TitleReaction } from '../../infrastructure/library.store';
import { Icon } from './icon';

@Component({
  selector: 'library-actions',
  standalone: true,
  imports: [Icon],
  template: `
    @if (item().kind === 'movie' || item().kind === 'series') {
      <div class="library-actions">
        <button
          class="watchlist-button"
          [class.selected]="library.wants(item())"
          [attr.aria-pressed]="library.wants(item())"
          (click)="library.toggleWatchlist(item())"
        >
          <span aria-hidden="true">{{ library.wants(item()) ? '✓' : '+' }}</span>
          {{ library.wants(item()) ? 'Na sua lista' : 'Quero assistir' }}
        </button>
        <div class="reactions" role="group" aria-label="Avaliar título">
          @for (reaction of reactions; track reaction.value) {
            <button
              [class.selected]="library.reaction(item()) === reaction.value"
              [attr.aria-pressed]="library.reaction(item()) === reaction.value"
              [attr.aria-label]="reaction.label"
              [title]="reaction.label"
              (click)="library.rate(item(), reaction.value)"
            >
              <span class="reaction-icons" aria-hidden="true">
                <ui-icon [name]="reaction.down ? 'thumb-down' : 'thumb-up'" />
                @if (reaction.double) {
                  <ui-icon [name]="reaction.down ? 'thumb-down' : 'thumb-up'" />
                }
              </span>
              <span>{{ reaction.label }}</span>
            </button>
          }
        </div>
      </div>
    }
  `,
  styles: [
    `
      .library-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
        margin: 16px 0;
      }
      button {
        border: 1px solid #ffffff35;
        background: #25252b;
        color: #eee;
        border-radius: 7px;
        cursor: pointer;
        font: inherit;
        font-size: 12px;
        padding: 10px 12px;
      }
      button:hover {
        background: #3b3b42;
        border-color: #aaa;
      }
      button.selected {
        background: #fff;
        color: #17171b;
        border-color: #fff;
      }
      button:focus-visible {
        outline: 2px solid #e50914;
        outline-offset: 3px;
      }
      .watchlist-button {
        display: flex;
        gap: 8px;
        align-items: center;
      }
      .watchlist-button > span {
        font-size: 20px;
        line-height: 1;
      }
      .reactions {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
      }
      .reactions button {
        display: grid;
        justify-items: center;
        gap: 6px;
        padding: 9px;
        font-size: 10px;
      }
      .reaction-icons {
        display: flex;
      }
    `,
  ],
})
export class LibraryActions {
  readonly item = input.required<MediaItem>();
  readonly library = inject(LibraryStore);
  readonly reactions: { value: TitleReaction; label: string; down?: boolean; double?: boolean }[] =
    [
      { value: 'liked', label: 'Gostei' },
      { value: 'loved', label: 'Amei', double: true },
      { value: 'disliked', label: 'Não gostei', down: true },
      { value: 'hated', label: 'Odiei', down: true, double: true },
    ];
}
