import { Component, computed, input } from '@angular/core';
const paths: Record<string, string> = {
  play: 'M8 5l12 7-12 7V5Z',
  pause: 'M8 5v14M16 5v14',
  search: 'm21 21-5-5M19 10a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z',
  back: 'M19 12H5m7-7-7 7 7 7',
  close: 'm6 6 12 12M6 18 18 6',
  chevron: 'm9 5 7 7-7 7',
  volume: 'm11 5-6 4H2v6h3l6 4V5Zm4 3a5 5 0 0 1 0 8m3-11a9 9 0 0 1 0 14',
  muted: 'm11 5-6 4H2v6h3l6 4V5Zm5 4 5 6m0-6-5 6',
  fullscreen: 'M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5',
  rewind: 'M4 10a8 8 0 1 1 1 8M4 4v6h6',
  forward: 'M20 10a8 8 0 1 0-1 8m1-14v6h-6',
  settings:
    'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm-3-5h6l1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1 1-3Z',
  episodes: 'M4 4h16v5H4zM4 15h16v5H4z',
  check: 'm5 12 4 4L20 5',
  info: 'M12 11v6m0-10v.01M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z',
  refresh: 'M20 7v5h-5M4 17v-5h5m-4-5a8 8 0 0 1 13-2l2 2M4 17l2 2a8 8 0 0 0 13-2',
  tv: 'M3 5h18v14H3zM8 22h8',
  clock: 'M12 7v5l3 2M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z',
};
@Component({
  selector: 'ui-icon',
  standalone: true,
  template:
    '<svg viewBox="0 0 24 24" aria-hidden="true" [attr.fill]="name() === \'play\' ? \'currentColor\' : \'none\'" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path [attr.d]="path()" /></svg>',
  styles: [
    ':host{display:inline-flex;width:1.35em;height:1.35em;flex-shrink:0}svg{width:100%;height:100%}',
  ],
})
export class Icon {
  name = input('play');
  path = computed(() => paths[this.name()] || paths['info']);
}
