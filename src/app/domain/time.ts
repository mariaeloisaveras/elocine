export function formatTime(value: number): string {
  const seconds = Math.max(0, Math.floor(Number.isFinite(value) ? value : 0));
  const hours = Math.floor(seconds / 3600);
  return `${hours ? hours + ':' : ''}${String(Math.floor(seconds / 60) % 60).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}
export function clampPosition(value: number, duration: number): number {
  return Math.max(0, Math.min(Number.isFinite(value) ? value : 0, Math.max(0, duration - 0.1)));
}
export function routeFor(item: { kind: string; id: string; parent_id?: string }): string {
  return item.kind === 'episode'
    ? `/watch/series/${item.parent_id}`
    : `/watch/${item.kind}/${item.id}`;
}
