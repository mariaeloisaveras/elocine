import { Programme } from '../domain/media';

export function currentProgramme(programmes: Programme[], now: number) {
  return programmes.find((programme) => programme.start <= now && programme.end > now);
}
export function programmeProgress(programme: Programme, now: number) {
  return Math.max(
    0,
    Math.min(100, ((now - programme.start) / (programme.end - programme.start)) * 100),
  );
}
