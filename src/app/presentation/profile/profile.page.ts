import { Component, ElementRef, computed, inject, signal, viewChild } from '@angular/core';
import { PROFILE_AVATARS, avatarLetter } from '../../domain/profile-avatar';
import { ProfileAvatar } from '../shared/profile-avatar';
import { RouterLink } from '@angular/router';
import { LibraryStore, TitleReaction } from '../../infrastructure/library.store';
import { Icon } from '../shared/icon';
import { MediaCard } from '../shared/media-card';
import { MediaCarousel } from '../shared/media-carousel';

@Component({
  standalone: true,
  imports: [RouterLink, Icon, MediaCard, MediaCarousel, ProfileAvatar],
  template: `
    <header>
      <a class="brand" routerLink="/" aria-label="Elocine, início"
        ><span class="brand-mark"><ui-icon name="play" /></span>ELOCINE<span class="brand-dot"
          >.</span
        ></a
      >
      <nav aria-label="Navegação">
        <a routerLink="/">Início</a><a routerLink="/browse/movie">Filmes</a
        ><a routerLink="/browse/series">Séries</a><a routerLink="/browse/live">Ao vivo</a
        ><a class="active" routerLink="/profile" aria-current="page">Meu perfil</a>
      </nav>
    </header>
    <dialog
      #avatarPicker
      class="avatar-picker"
      aria-labelledby="avatar-picker-title"
      (click)="onDialogClick($event)"
    >
      <div class="picker-heading">
        <div>
          <span class="eyebrow">DO SEU JEITO</span>
          <h2 id="avatar-picker-title">Quem vai dar o play?</h2>
        </div>
        <button
          class="picker-close"
          aria-label="Fechar seleção de avatar"
          (click)="closeAvatarPicker()"
        >
          <ui-icon name="close" />
        </button>
      </div>
      <p class="picker-description">Escolha um personagem para acompanhar suas maratonas.</p>
      <div class="avatar-options" role="group" aria-label="Avatares disponíveis">
        @for (avatar of avatars; track avatar.id) {
          <button
            class="avatar-option"
            [class.selected]="library.avatar().id === avatar.id"
            [attr.aria-pressed]="library.avatar().id === avatar.id"
            [attr.aria-label]="avatar.name"
            (click)="chooseAvatar(avatar.id)"
          >
            <span class="avatar-tile"
              ><profile-avatar [avatar]="avatar.id === 'classic' ? classicAvatar() : avatar" />
              @if (library.avatar().id === avatar.id) {
                <span class="avatar-check" aria-hidden="true">✓</span>
              }
            </span>
            <span>{{ avatar.name }}</span>
          </button>
        }
      </div>
      @if (editingLetter()) {
        <form class="avatar-letter-form" (submit)="saveLetter($event)">
          <label for="avatar-letter">Qual letra vai no seu avatar?</label>
          <div class="avatar-letter-controls">
            <span
              class="letter-preview"
              [style.background]="avatars[0].background"
              aria-hidden="true"
              >{{ letterDraft() || 'E' }}</span
            >
            <input
              #letterInput
              id="avatar-letter"
              type="text"
              [value]="letterDraft()"
              (input)="updateLetter($event)"
              autocomplete="off"
              aria-describedby="avatar-letter-help"
            />
            <button type="submit" [disabled]="!letterDraft()">Salvar letra</button>
          </div>
          <p id="avatar-letter-help">Escolha uma letra. Ela vai aparecer em maiúscula.</p>
        </form>
      }
    </dialog>
    <main>
      <section class="profile-intro">
        <button
          class="profile-avatar"
          aria-label="Escolher avatar do perfil"
          title="Trocar avatar"
          (click)="openAvatarPicker()"
        >
          <profile-avatar [avatar]="library.avatar()" />
          <span class="avatar-edit" aria-hidden="true">✎</span>
        </button>
        <div>
          <span class="eyebrow">SEU ESPAÇO NO ELOCINE</span>
          <h1>Meu perfil</h1>
          <p>Suas histórias, sua lista e o que você achou de cada play.</p>
        </div>
      </section>
      @for (rail of rails(); track rail.id) {
        <section class="profile-section">
          <div class="section-heading">
            <h2>{{ rail.title }}</h2>
            <span>{{ rail.items.length }} títulos</span>
          </div>
          @if (rail.items.length) {
            <media-carousel [label]="rail.title">
              @for (item of rail.items; track item.kind + ':' + item.id) {
                <media-card [item]="item" />
              }
            </media-carousel>
          } @else {
            <div class="empty-list">
              <ui-icon name="episodes" />
              <p>{{ rail.empty }}</p>
            </div>
          }
        </section>
      }
      <p class="storage-note">Sua lista e suas avaliações ficam salvas neste navegador.</p>
    </main>
  `,
  styleUrl: './profile.page.css',
})
export class ProfilePage {
  readonly library = inject(LibraryStore);
  readonly classicAvatar = computed(() => ({
    ...PROFILE_AVATARS[0],
    icon: this.library.avatarInitial(),
  }));
  readonly avatars = PROFILE_AVATARS;
  readonly editingLetter = signal(false);
  readonly letterDraft = signal('');
  updateLetter(event: Event) {
    const input = event.target as HTMLInputElement;
    const letter = avatarLetter(input.value);
    this.letterDraft.set(letter);
    input.value = letter;
  }
  saveLetter(event: Event) {
    event.preventDefault();
    if (!this.letterDraft()) return;
    this.library.setAvatarLetter(this.letterDraft());
    this.closeAvatarPicker();
  }
  private readonly avatarPicker = viewChild<ElementRef<HTMLDialogElement>>('avatarPicker');
  openAvatarPicker() {
    this.editingLetter.set(false);
    this.avatarPicker()?.nativeElement.showModal();
  }
  closeAvatarPicker() {
    this.avatarPicker()?.nativeElement.close();
  }
  chooseAvatar(id: string) {
    if (id === 'classic') {
      this.letterDraft.set(this.library.avatarInitial());
      this.editingLetter.set(true);
      return;
    }
    this.library.setAvatar(id);
    this.closeAvatarPicker();
  }
  onDialogClick(event: MouseEvent) {
    const dialog = this.avatarPicker()?.nativeElement;
    if (event.target !== dialog || !dialog) return;
    const bounds = dialog.getBoundingClientRect();
    if (
      event.clientX < bounds.left ||
      event.clientX > bounds.right ||
      event.clientY < bounds.top ||
      event.clientY > bounds.bottom
    )
      this.closeAvatarPicker();
  }
  readonly rails = computed(() => {
    const rated = (reaction: TitleReaction) =>
      this.library
        .ratings()
        .filter((entry) => entry.reaction === reaction)
        .map((entry) => entry.item);
    return [
      {
        id: 'completed',
        title: 'Assistidos recentemente',
        items: this.library.completed(),
        empty: 'Os filmes concluídos e as séries com uma temporada concluída aparecem aqui.',
      },
      {
        id: 'watchlist',
        title: 'Quero assistir',
        items: this.library.watchlist(),
        empty: 'Adicione títulos à sua lista pela prévia ou pela página do título.',
      },
      {
        id: 'loved',
        title: 'Amei · 👍👍',
        items: rated('loved'),
        empty: 'Suas histórias favoritas, com dois joias, aparecem aqui.',
      },
      {
        id: 'liked',
        title: 'Gostei · 👍',
        items: rated('liked'),
        empty: 'Os títulos que você curtiu aparecem aqui.',
      },
      {
        id: 'disliked',
        title: 'Não gostei · 👎',
        items: rated('disliked'),
        empty: 'Os títulos de que você não gostou aparecem aqui.',
      },
      {
        id: 'hated',
        title: 'Odiei · 👎👎',
        items: rated('hated'),
        empty: 'Os títulos que receberam dois joias para baixo aparecem aqui.',
      },
    ];
  });
}
