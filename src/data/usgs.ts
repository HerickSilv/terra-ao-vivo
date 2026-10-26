import { z } from 'zod';
import { safeHttpsUrl } from '../lib/escape';
import type { Quake } from '../lib/types';
import { fetchJson } from './http';

// Um único feed semanal (M2.5+) alimenta as janelas de 24 h e 7 d: alternar a janela é instantâneo.
export const USGS_URL =
  'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_week.geojson';

const Feature = z.object({
  id: z.string(),
  properties: z.object({
    mag: z.number().nullable(),
    place: z.string().nullish(),
    time: z.number(),
    url: z.string().nullish(),
  }),
  geometry: z.object({
    coordinates: z.tuple([z.number(), z.number(), z.number().nullable()]),
  }),
});

const Collection = z.object({ features: z.array(z.unknown()) });

/** Converte o GeoJSON do USGS; itens inválidos são descartados, o formato geral é exigido. */
export function parseUsgs(json: unknown): Quake[] {
  const collection = Collection.safeParse(json);
  if (!collection.success) throw new Error('Resposta do USGS fora do formato esperado');
  const quakes: Quake[] = [];
  for (const raw of collection.data.features) {
    const feature = Feature.safeParse(raw);
    if (!feature.success) continue;
    const { mag, place, time, url } = feature.data.properties;
    const [lng, lat, depth] = feature.data.geometry.coordinates;
    if (mag === null || Math.abs(lat) > 90 || Math.abs(lng) > 180) continue;
    quakes.push({
      id: feature.data.id,
      time,
      mag,
      place: place ?? 'Local não informado',
      lat,
      lng,
      depthKm: depth,
      url: safeHttpsUrl(url),
    });
  }
  return quakes.sort((a, b) => b.time - a.time);
}

export async function fetchQuakes(signal: AbortSignal): Promise<Quake[]> {
  return parseUsgs(await fetchJson(USGS_URL, { signal }));
}
