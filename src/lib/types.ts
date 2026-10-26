export interface Quake {
  id: string;
  time: number;
  mag: number;
  place: string;
  lat: number;
  lng: number;
  depthKm: number | null;
  url: string | null;
}

export type EventCategory = 'severeStorms' | 'volcanoes' | 'seaLakeIce' | 'wildfires' | 'other';

export interface TrackPoint {
  lat: number;
  lng: number;
  time: number;
}

export interface NaturalEvent {
  id: string;
  title: string;
  category: EventCategory;
  lat: number;
  lng: number;
  /** Data da última observação (ms). */
  time: number;
  magnitude: { value: number; unit: string } | null;
  /** Trajetória (tempestades): pontos em ordem cronológica. */
  track: TrackPoint[];
  link: string | null;
}

export interface FireCell {
  lat: number;
  lng: number;
  count: number;
}

export interface FireSnapshot {
  generatedAt: number;
  latestDetection: number;
  windowFrom: number;
  windowTo: number;
  total: number;
  previousTotal: number;
  byState: { state: string; count: number }[];
  cells: FireCell[];
  sourceName: string;
  sourceUrl: string;
}

export type LayerKey = 'quakes' | 'events' | 'fires';
export type QuakeWindow = '24h' | '7d';

export interface LayerState<T> {
  status: 'loading' | 'ok' | 'error';
  data: T | null;
  /** Quando a camada foi baixada com sucesso pela última vez (ms). */
  updatedAt: number | null;
  error: string | null;
}

export const emptyLayer = <T>(): LayerState<T> => ({
  status: 'loading',
  data: null,
  updatedAt: null,
  error: null,
});

export interface PlaceWeather {
  temperature: number | null;
  apparent: number | null;
  humidity: number | null;
  precipitation: number | null;
  windSpeed: number | null;
  windGusts: number | null;
  code: number | null;
  isDay: boolean;
}

export interface PlaceAir {
  aqi: number | null;
  pm25: number | null;
  pm10: number | null;
}

export interface PlaceProbe {
  lat: number;
  lng: number;
  /** Rótulo do lugar (país, quando o clique caiu em terra). */
  label: string | null;
  /** Horário local do lugar, "AAAA-MM-DDTHH:mm" (como devolvido pela API). */
  localTime: string | null;
  weather: PlaceWeather | null;
  /** Próximas 24 h de temperatura, a partir da hora cheia atual. */
  hourly: { hours: string[]; temps: (number | null)[] } | null;
  air: PlaceAir | null;
}

/** Elemento citável na lista acessível e no globo. */
export type FocusTarget =
  | { kind: 'quake'; id: string }
  | { kind: 'event'; id: string }
  | { kind: 'place'; lat: number; lng: number };
