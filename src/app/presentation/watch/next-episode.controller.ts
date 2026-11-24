import { computed, effect, signal, untracked } from '@angular/core';

export const NEXT_EPISODE_WINDOW_SECONDS = 30;
const COUNTDOWN_MILLISECONDS = 5000;
const PROGRESS_INTERVAL_MILLISECONDS = 50;

interface NextEpisodeContext {
  episodeKey(): string;
  eligible(): boolean;
  disabled(): boolean;
  playing(): boolean;
  waiting(): boolean;
  onAdvance(): void;
  onCancel(): void;
}

/** UI countdown scoped to one episode; effects and timers follow the component lifetime. */
export class NextEpisodeController {
  readonly cancelled = signal(false);
  readonly progress = signal(0);
  readonly triggered = signal(false);
  readonly stopped = computed(() => this.cancelled() || this.context.disabled());
  readonly visible = computed(() => this.context.eligible());
  readonly remainingSeconds = computed(() =>
    Math.max(0, Math.ceil((COUNTDOWN_MILLISECONDS / 1000) * (1 - this.progress() / 100))),
  );
  private readonly running = computed(
    () => this.visible() && !this.stopped() && this.context.playing() && !this.context.waiting(),
  );
  private elapsedMilliseconds = 0;

  constructor(private readonly context: NextEpisodeContext) {
    const episodeKey = computed(() => context.episodeKey());

    effect(() => {
      episodeKey();
      untracked(() => {
        this.cancelled.set(false);
        this.triggered.set(false);
        this.resetProgress();
      });
    });

    effect((onCleanup) => {
      if (!this.visible()) {
        untracked(() => this.resetProgress());
        return;
      }
      if (!this.running()) return;

      const episode = episodeKey();
      let lastTick = performance.now();
      const timer = setInterval(() => {
        const now = performance.now();
        if (episode !== episodeKey() || !this.running()) {
          lastTick = now;
          return;
        }

        this.elapsedMilliseconds += now - lastTick;
        lastTick = now;
        this.progress.set(Math.min(100, (this.elapsedMilliseconds / COUNTDOWN_MILLISECONDS) * 100));
        if (this.elapsedMilliseconds >= COUNTDOWN_MILLISECONDS) {
          clearInterval(timer);
          this.advance();
        }
      }, PROGRESS_INTERVAL_MILLISECONDS);

      onCleanup(() => clearInterval(timer));
    });
  }

  cancel(): void {
    if (!this.visible() || this.stopped() || this.triggered()) return;
    this.cancelled.set(true);
    this.resetProgress();
    this.context.onCancel();
  }

  advance(): void {
    if (this.triggered() || !this.visible()) return;
    this.triggered.set(true);
    this.cancelled.set(true);
    this.context.onAdvance();
  }

  private resetProgress(): void {
    this.elapsedMilliseconds = 0;
    this.progress.set(0);
  }
}
