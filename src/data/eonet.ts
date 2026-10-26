import { z } from 'zod';
import { safeHttpsUrl } from '../lib/escape';
import type { EventCategory, NaturalEvent, TrackPoint } from '../lib/types';
import { fetchJson } from './http';

const BASE = 'https://eonet.gsfc.nasa.gov/api/v3/events';
// `status=open` puro devolve ~5 MB (7 mil incêndios antigos). Com days=30 são ~125 KB.
export const EONET_RECENT_URL = `${BASE}?status=open&days=30`;
// Vulcões abertos têm última observação antiga; por isso uma consulta própria e minúscula.
export const EONET_VOLCANOES_URL = `${BASE}?status=open&category=volcanoes`;

const Geometry = z.object({
  date: z.string(),
  type: z.string(),
  coordinates: z.unknown(),
  magnitudeValue: z.number().nullish(),
  magnitudeUnit: z.string().nullish(),
});

const EventSchema = z.object({
  id: z.string(),
  title: z.string(),
  link: z.string().nullish(),
  categories: z.array(z.object({ id: z.string() })),
  geometry: z.array(Geometry),
});

const Collection = z.object({ events: z.array(z.unknown()) });

const CATEGORIES: Record<string, EventCategory> = {
  severeStorms: 'severeStorms',
  volcanoes: 'volcanoes',
  seaLakeIce: 'seaLakeIce',
  wildfires: 'wildfires',
};

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Ponto [lng, lat] de uma geometria EONET (ponto ou centroide do anel externo do polígono). */
function locate(type: string, coordinates: unknown): [number, number] | null {
  if (type === 'Point' && Array.isArray(coordinates)) {
    const [lng, lat] = coordinates as unknown[];
    return isNum(lng) && isNum(lat) ? [lng, lat] : null;
  }
  if (type === 'Polygon' && Array.isArray(coordinates)) {
    const ring = (coordinates as unknown[])[0];
    if (!Array.isArray(ring) || ring.length === 0) return null;
    let sumLng = 0;
    let sumLat = 0;
    let n = 0;
    for (const vertex of ring as unknown[]) {
      if (Array.isArray(vertex) && isNum(vertex[0]) && isNum(vertex[1])) {
        sumLng += vertex[0];
        sumLat += vertex[1];
        n += 1;
      }
    }
    return n > 0 ? [sumLng / n, sumLat / n] : null;
  }
  return null;
}

/** Converte a resposta do EONET; eventos sem posição válida são descartados. */
export function parseEonet(json: unknown): NaturalEvent[] {
  const collection = Collection.safeParse(json);
  if (!collection.success) throw new Error('Resposta do EONET fora do formato esperado');
  const events: NaturalEvent[] = [];
  for (const raw of collection.data.events) {
    const parsed = EventSchema.safeParse(raw);
    if (!parsed.success) continue;
    const { id, title, link, categories, geometry } = parsed.data;

    const points: (TrackPoint & { magnitude: NaturalEvent['magnitude'] })[] = [];
    for (const g of geometry) {
      const where = locate(g.type, g.coordinates);
      const time = Date.parse(g.date);
      if (!where || Number.isNaN(time)) continue;
      const [lng, lat] = where;
      if (Math.abs(lat) > 90 || Math.abs(lng) > 180) continue;
      points.push({
        lat,
        lng,
        time,
        magnitude:
          isNum(g.magnitudeValue) && g.magnitudeUnit
            ? { value: g.magnitudeValue, unit: g.magnitudeUnit }
            : null,
      });
    }
    points.sort((a, b) => a.time - b.time);
    const last = points[points.length - 1];
    if (!last) continue;

    events.push({
      id,
      title,
      category: CATEGORIES[categories[0]?.id ?? ''] ?? 'other',
      lat: last.lat,
      lng: last.lng,
      time: last.time,
      magnitude: last.magnitude,
      track: points.map(({ lat, lng, time }) => ({ lat, lng, time })),
      link: safeHttpsUrl(link),
    });
  }
  return events;
}

export function mergeEvents(...lists: NaturalEvent[][]): NaturalEvent[] {
  const byId = new Map<string, NaturalEvent>();
  for (const list of lists) for (const event of list) byId.set(event.id, event);
  return [...byId.values()].sort((a, b) => b.time - a.time);
}

export async function fetchEvents(signal: AbortSignal): Promise<NaturalEvent[]> {
  const [recent, volcanoes] = await Promise.allSettled([
    fetchJson(EONET_RECENT_URL, { signal }).then(parseEonet),
    fetchJson(EONET_VOLCANOES_URL, { signal }).then(parseEonet),
  ]);
  // A consulta principal é obrigatória; a de vulcões degrada em silêncio.
  if (recent.status === 'rejected') throw recent.reason;
  return mergeEvents(recent.value, volcanoes.status === 'fulfilled' ? volcanoes.value : []);
}
