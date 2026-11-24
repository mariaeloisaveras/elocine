export type CatalogKind = 'movie' | 'series' | 'live';
export type MediaKind = CatalogKind | 'episode';
export interface MediaItem {
  id: string;
  kind: MediaKind;
  title: string;
  artwork: string;
  backdrop: string;
  category_id: string;
  rating: string;
  year: string;
  synopsis: string;
  duration: number;
  parent_id: string;
  season: string;
  episode: string;
  cast?: string;
  director?: string;
  genre?: string;
  country?: string;
}
export interface Details {
  item: MediaItem;
  episodes: MediaItem[];
}
export interface Category {
  id: string;
  name: string;
}
export interface CatalogQuery {
  kind: CatalogKind;
  q?: string;
  category?: string;
  platform?: string;
  page?: number;
  limit?: number;
}
export interface CatalogPage {
  items: MediaItem[];
  total: number;
  page: number;
  pages: number;
}
export interface PlatformCatalogQuery {
  kind?: 'all' | 'movie' | 'series';
  q?: string;
  page?: number;
  limit?: number;
}
export interface PlatformCatalogPage extends CatalogPage {
  id: string;
  name: string;
}
export interface PlatformRail {
  id: string;
  name: string;
  items: MediaItem[];
  total: number;
}
export interface Account {
  status: string;
  connections: number;
  max_connections: number;
  compatibility_available: boolean;
  demo: boolean;
}
export interface Playback {
  id: string;
  media_url: string;
  item: MediaItem;
  compatibility: boolean;
  prefetch: boolean;
  is_hls: boolean;
  can_seek: boolean;
  offset: number;
  initial_position?: number;
  audio_index?: number | null;
  subtitle_index?: number | null;
}
export interface PlaybackRequest {
  kind: MediaKind;
  id: string;
  parent_id?: string;
  compatibility: boolean;
  offset?: number;
}
export interface DownloadProgress {
  media_tracks?: MediaTrack[];
  tracks_ready?: boolean;
  size: number;
  total: number | null;
  done: boolean;
  error: string | null;
  offset: number;
}
export interface HistoryEntry {
  item: MediaItem;
  parent: MediaItem;
  position: number;
  duration: number;
  updated: number;
}

export abstract class CatalogRepository {
  abstract schedule(id: string, signal?: AbortSignal): Promise<ChannelSchedule>;
  abstract platformCatalog(
    id: string,
    query: PlatformCatalogQuery,
    signal?: AbortSignal,
  ): Promise<PlatformCatalogPage>;
  abstract platforms(signal?: AbortSignal): Promise<PlatformRail[]>;
  abstract search(query: CatalogQuery, signal?: AbortSignal): Promise<CatalogPage>;
  abstract categories(kind: CatalogKind, signal?: AbortSignal): Promise<Category[]>;
  abstract details(kind: CatalogKind, id: string, signal?: AbortSignal): Promise<Details>;
  abstract account(signal?: AbortSignal): Promise<Account>;
}
export abstract class PlaybackRepository {
  abstract selectTracks(id: string, selection: TrackSelection): Promise<Playback>;
  abstract subtitles(id: string, after: number): Promise<SubtitleBatch>;
  abstract start(request: PlaybackRequest, signal?: AbortSignal): Promise<Playback>;
  abstract seek(id: string, seconds: number): Promise<Playback>;
  abstract stop(id: string): Promise<void>;
  abstract progress(id: string): Promise<DownloadProgress>;
  abstract release(id: string): void;
}

export interface Programme {
  title: string;
  description: string;
  start: number;
  end: number;
}
export interface ChannelSchedule {
  programmes: Programme[];
}

export interface MediaTrack {
  index: number;
  kind: 'audio' | 'subtitle';
  language: string;
  codec: string;
  supported: boolean;
}
export interface TrackSelection {
  audio_index: number | null;
  subtitle_index: number | null;
  seconds: number;
}
export interface SubtitleCue {
  start: number;
  end: number;
  text: string;
}
export interface SubtitleBatch {
  cues: SubtitleCue[];
  cursor: number;
}
