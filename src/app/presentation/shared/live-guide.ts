import {
  Component,
  DestroyRef,
  ElementRef,
  HostListener,
  computed,
  effect,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { Programme } from '../../domain/media';
import { currentProgramme, programmeProgress } from '../../application/programme';
import { ScheduleStore } from '../../infrastructure/schedule.store';
import { Icon } from './icon';

@Component({
  selector: 'live-guide',
  standalone: true,
  imports: [DatePipe, Icon],
  templateUrl: './live-guide.html',
  styleUrl: './live-guide.css',
  host: { '[class.player-guide]': "mode()==='player'", '[class.guide-open]': 'open()' },
})
export class LiveGuide {
  readonly channel = input.required<string>();
  readonly mode = input<'card' | 'player'>('card');
  readonly open = signal(false);
  readonly programmes = signal<Programme[]>([]);
  readonly loading = signal(false);
  readonly error = signal(false);
  readonly now = signal(Date.now() / 1000);
  readonly current = computed(() => currentProgramme(this.programmes(), this.now()));
  readonly next = computed(() =>
    this.programmes().find((programme) => programme.start > this.now()),
  );
  readonly upcoming = computed(() =>
    this.programmes().filter((programme) => programme.end > this.now()),
  );
  readonly progress = computed(() =>
    this.current() ? programmeProgress(this.current()!, this.now()) : 0,
  );
  readonly toggle = viewChild<ElementRef<HTMLButtonElement>>('toggle');
  private readonly store = inject(ScheduleStore);
  private readonly element = inject(ElementRef<HTMLElement>);
  private readonly active = signal(false);
  private revision = 0;
  private loadedChannel = '';
  private destroyed = false;
  constructor() {
    let observer: IntersectionObserver | undefined;
    if (typeof IntersectionObserver !== 'undefined') {
      observer = new IntersectionObserver((entries) =>
        this.active.set(entries.some((entry) => entry.isIntersecting)),
      );
      observer.observe(this.element.nativeElement);
    } else this.active.set(true);
    effect(() => {
      const id = this.channel();
      const active = this.active() || this.mode() === 'player';
      if (active) void this.refresh(id);
    });
    const timer = setInterval(() => {
      if ((this.active() || this.mode() === 'player') && document.visibilityState !== 'hidden')
        void this.refresh(this.channel());
    }, 60_000);
    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
      this.revision++;
      observer?.disconnect();
      clearInterval(timer);
    });
  }
  async refresh(id = this.channel()) {
    if (id !== this.loadedChannel) {
      this.loadedChannel = id;
      this.programmes.set([]);
      this.error.set(false);
      this.open.set(false);
    }
    const revision = ++this.revision;
    this.loading.set(true);
    this.now.set(Date.now() / 1000);
    try {
      const result = await this.store.get(id);
      if (!this.destroyed && revision === this.revision) {
        this.programmes.set(result.programmes);
        this.error.set(false);
      }
    } catch {
      if (!this.destroyed && revision === this.revision) this.error.set(true);
    } finally {
      if (!this.destroyed && revision === this.revision) this.loading.set(false);
    }
  }
  show() {
    this.open.set(true);
    void this.refresh();
  }
  close() {
    this.open.set(false);
    this.toggle()?.nativeElement.focus();
  }
  @HostListener('keydown.escape', ['$event']) escape(event: Event) {
    if (this.open()) {
      event.stopPropagation();
      this.close();
    }
  }
}
