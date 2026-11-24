import { describe, expect, it, vi } from 'vitest';
import { PlaybackUseCases } from './playback.use-cases';
import { MediaItem, PlaybackRepository } from '../domain/media';
describe('Playback use cases', () => {
  const port = {
    start: vi.fn(),
    seek: vi.fn(),
    stop: vi.fn(),
    progress: vi.fn(),
    release: vi.fn(),
  } as unknown as PlaybackRepository;
  it('starts with compatibility by default and carries episode identity', async () => {
    const useCase = new PlaybackUseCases(port);
    const item = { id: '101', kind: 'episode', parent_id: '1' } as MediaItem;
    await useCase.start(item);
    expect(port.start).toHaveBeenCalledWith(
      { kind: 'episode', id: '101', parent_id: '1', compatibility: true, offset: 0 },
      undefined,
    );
  });
  it('does not start a whole series as if it were a video', async () => {
    await expect(new PlaybackUseCases(port).start({ kind: 'series' } as MediaItem)).rejects.toThrow(
      'episódio',
    );
  });
  it('does not send invalid seek positions to the server', async () => {
    await expect(new PlaybackUseCases(port).seek('session', NaN)).rejects.toThrow('inválida');
  });
});
