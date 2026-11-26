import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TrackMenu } from './track-menu';

afterEach(() => TestBed.resetTestingModule());
describe('Menu de áudio e legendas', () => {
  it('closes on outside clicks and preserves clicks inside the menu', () => {
    const fixture = TestBed.createComponent(TrackMenu);
    fixture.detectChanges();
    const menu = fixture.nativeElement.querySelector('details') as HTMLDetailsElement;
    menu.open = true;
    menu
      .querySelector('h3')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
    expect(menu.open).toBe(true);
    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
    expect(menu.open).toBe(false);
    fixture.destroy();
  });

  it('labels languages, offers subtitle off and disables unsupported image captions', async () => {
    const fixture = TestBed.createComponent(TrackMenu);
    fixture.componentRef.setInput('ready', true);
    fixture.componentRef.setInput('audio', 1);
    fixture.componentRef.setInput('tracks', [
      { index: 1, kind: 'audio', language: 'por', codec: 'aac', supported: true },
      { index: 2, kind: 'audio', language: 'eng', codec: 'aac', supported: true },
      { index: 3, kind: 'subtitle', language: 'por', codec: 'subrip', supported: true },
      { index: 4, kind: 'subtitle', language: 'eng', codec: 'hdmv_pgs_subtitle', supported: false },
    ]);
    fixture.detectChanges();
    await fixture.whenStable();
    const menu = fixture.nativeElement.querySelector('details') as HTMLDetailsElement;
    menu.open = true;
    menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(menu.open).toBe(false);
    const selected = vi.fn();
    fixture.componentInstance.selection.subscribe(selected);
    const selects = fixture.nativeElement.querySelectorAll(
      'select',
    ) as NodeListOf<HTMLSelectElement>;
    expect(selects[0].textContent).toContain('português');
    expect(selects[0].textContent).toContain('inglês');
    expect(selects[1].querySelector('option[value="4"]')!.hasAttribute('disabled')).toBe(true);
    selects[1].value = '3';
    selects[1].dispatchEvent(new Event('change'));
    expect(selected).toHaveBeenLastCalledWith({ audio_index: 1, subtitle_index: 3 });
    selects[1].value = '-1';
    selects[1].dispatchEvent(new Event('change'));
    expect(selected).toHaveBeenLastCalledWith({ audio_index: 1, subtitle_index: null });
  });
});
