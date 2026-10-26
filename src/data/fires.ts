import { z } from 'zod';
import type { FireSnapshot } from '../lib/types';
import { fetchJson } from './http';

/**
 * O snapshot é gerado pelo ETL em Python (etl/) e publicado junto com o site.
 * O CSV diário do INPE tem ~4-5 MB; o JSON agregado tem ~30 KB.
 */
export const FIRES_URL = `${import.meta.env.BASE_URL}data/focos.json`;

const Iso = z.string().refine((s) => !Number.isNaN(Date.parse(s)), 'data inválida');

const Snapshot = z.object({
  schemaVersion: z.literal(1),
  generatedAt: Iso,
  source: z.object({ name: z.string(), url: z.string() }),
  window: z.object({ from: Iso, to: Iso, hours: z.number() }),
  latestDetection: Iso,
  total: z.number().int().nonnegative(),
  previousTotal: z.number().int().nonnegative(),
  byState: z.array(z.object({ state: z.string(), count: z.number().int().nonnegative() })),
  cells: z.array(z.tuple([z.number(), z.number(), z.number().int().positive()])),
});

export function parseFires(json: unknown): FireSnapshot {
  const parsed = Snapshot.safeParse(json);
  if (!parsed.success) throw new Error('Snapshot de queimadas fora do formato esperado');
  const s = parsed.data;
  return {
    generatedAt: Date.parse(s.generatedAt),
    latestDetection: Date.parse(s.latestDetection),
    windowFrom: Date.parse(s.window.from),
    windowTo: Date.parse(s.window.to),
    total: s.total,
    previousTotal: s.previousTotal,
    byState: s.byState,
    cells: s.cells
      .filter(([lat, lng]) => Math.abs(lat) <= 90 && Math.abs(lng) <= 180)
      .map(([lat, lng, count]) => ({ lat, lng, count })),
    sourceName: s.source.name,
    sourceUrl: s.source.url,
  };
}

export async function fetchFires(signal: AbortSignal): Promise<FireSnapshot> {
  return parseFires(await fetchJson(FIRES_URL, { signal, cache: 'no-cache' }));
}
