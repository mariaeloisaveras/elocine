import { MediaItem, PlaybackRepository } from '../domain/media';

export class PlaybackUseCases {
  constructor(private readonly repository: PlaybackRepository) {}
  start(item: MediaItem, compatibility = true, offset = 0, signal?: AbortSignal) {
    if (item.kind === 'series') return Promise.reject(new Error('Escolha um episódio.'));
    return this.repository.start(
      {
        kind: item.kind,
        id: item.id,
        parent_id: item.parent_id,
        compatibility,
        offset: Math.max(0, offset),
      },
      signal,
    );
  }
  seek(id: string, seconds: number) {
    if (!Number.isFinite(seconds) || seconds < 0)
      return Promise.reject(new Error('Posição inválida.'));
    return this.repository.seek(id, seconds);
  }
  stop(id: string) {
    return this.repository.stop(id);
  }
  progress(id: string) {
    return this.repository.progress(id);
  }
  release(id: string) {
    this.repository.release(id);
  }
}
