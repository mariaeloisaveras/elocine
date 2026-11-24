import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LibraryStore } from '../../infrastructure/library.store';
import { MediaItem } from '../../domain/media';
import { ProfilePage } from './profile.page';
import { LibraryActions } from '../shared/library-actions';

describe('Profile collections', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
  });

  it('opens the avatar card and saves the selected character', () => {
    const profile = TestBed.createComponent(ProfilePage);
    profile.detectChanges();
    const root = profile.nativeElement as HTMLElement;
    const dialog = root.querySelector('dialog')!;
    dialog.showModal = vi.fn();
    dialog.close = vi.fn();
    root.querySelector<HTMLButtonElement>('.profile-avatar')!.click();
    expect(dialog.showModal).toHaveBeenCalledOnce();
    expect(root.querySelectorAll('.avatar-option')).toHaveLength(12);
    root.querySelector<HTMLButtonElement>('[aria-label="Gato debochado"]')!.click();
    profile.detectChanges();
    expect(dialog.close).toHaveBeenCalledOnce();
    expect(root.querySelector('.profile-avatar')!.textContent).toContain('😼');
    expect(root.querySelector('[aria-label="Gato debochado"]')!.getAttribute('aria-pressed')).toBe(
      'true',
    );
    expect(new LibraryStore().avatar().id).toBe('cat');
    profile.destroy();
  });

  it('lets the classic avatar use a chosen uppercase letter', () => {
    const profile = TestBed.createComponent(ProfilePage);
    profile.detectChanges();
    const root = profile.nativeElement as HTMLElement;
    const dialog = root.querySelector('dialog')!;
    dialog.close = vi.fn();
    root.querySelector<HTMLButtonElement>('[aria-label="Clássico Elocine"]')!.click();
    profile.detectChanges();
    expect(dialog.close).not.toHaveBeenCalled();
    const input = root.querySelector<HTMLInputElement>('#avatar-letter')!;
    input.value = 'á';
    input.dispatchEvent(new Event('input'));
    profile.detectChanges();
    root.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    profile.detectChanges();
    expect(dialog.close).toHaveBeenCalledOnce();
    expect(root.querySelector('.profile-avatar')!.textContent).toContain('Á');
    const restored = new LibraryStore();
    expect(restored.avatar().icon).toBe('Á');
    restored.setAvatar('cat');
    restored.setAvatar('classic');
    expect(restored.avatar().icon).toBe('Á');
    profile.destroy();
  });

  it('updates profile carousels when watchlist and rating buttons are used', () => {
    const item = { id: '1', kind: 'movie', title: 'Meu filme', artwork: '' } as MediaItem;
    const profile = TestBed.createComponent(ProfilePage);
    const actions = TestBed.createComponent(LibraryActions);
    actions.componentRef.setInput('item', item);
    profile.detectChanges();
    actions.detectChanges();
    const root = actions.nativeElement as HTMLElement;
    root.querySelector<HTMLButtonElement>('.watchlist-button')!.click();
    root.querySelector<HTMLButtonElement>('[aria-label="Amei"]')!.click();
    profile.detectChanges();
    actions.detectChanges();
    const rails = profile.componentInstance.rails();
    expect(rails.find((rail) => rail.id === 'watchlist')!.items).toEqual([item]);
    expect(rails.find((rail) => rail.id === 'loved')!.items).toEqual([item]);
    expect(root.querySelector('[aria-label="Amei"]')!.getAttribute('aria-pressed')).toBe('true');
    root.querySelector<HTMLButtonElement>('[aria-label="Odiei"]')!.click();
    profile.detectChanges();
    expect(profile.componentInstance.rails().find((rail) => rail.id === 'loved')!.items).toEqual(
      [],
    );
    expect(profile.componentInstance.rails().find((rail) => rail.id === 'hated')!.items).toEqual([
      item,
    ]);
    TestBed.inject(LibraryStore).finish(item);
    profile.detectChanges();
    expect(
      profile.componentInstance.rails().find((rail) => rail.id === 'completed')!.items,
    ).toEqual([item]);
    expect(profile.nativeElement.querySelectorAll('media-carousel').length).toBe(2);
    actions.destroy();
    profile.destroy();
  });
});
