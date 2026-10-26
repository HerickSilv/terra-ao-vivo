import { fmtBrasilia, fmtDec, fmtInt, fmtRelative, placePt } from '../lib/format';
import type { FireSnapshot, NaturalEvent, Quake, QuakeWindow } from '../lib/types';

/** Trecho de texto; `strong` destaca o número sem precisar de HTML. */
export type Part = string | { strong: string };

export interface Insight {
  id: 'quakes' | 'fires' | 'storms' | 'events';
  parts: Part[];
}

export const WINDOW_MS: Record<QuakeWindow, number> = {
  '24h': 24 * 3_600_000,
  '7d': 7 * 24 * 3_600_000,
};

export const WINDOW_LABEL: Record<QuakeWindow, string> = {
  '24h': 'nas últimas 24 h',
  '7d': 'nos últimos 7 dias',
};

export function filterQuakes(
  quakes: Quake[],
  options: { window: QuakeWindow; minMag: number; now: number },
): Quake[] {
  const since = options.now - WINDOW_MS[options.window];
  return quakes.filter((q) => q.time >= since && q.mag >= options.minMag);
}

export interface QuakeStats {
  count: number;
  largest: Quake | null;
  lastHour: number;
  m6plus: number;
}

export function quakeStats(quakes: Quake[], now: number): QuakeStats {
  let largest: Quake | null = null;
  let lastHour = 0;
  let m6plus = 0;
  for (const q of quakes) {
    if (!largest || q.mag > largest.mag) largest = q;
    if (now - q.time <= 3_600_000) lastHour += 1;
    if (q.mag >= 6) m6plus += 1;
  }
  return { count: quakes.length, largest, lastHour, m6plus };
}

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

export function describeQuakes(
  stats: QuakeStats,
  options: { window: QuakeWindow; minMag: number; now: number },
): Insight {
  const mag = fmtDec(options.minMag, 1);
  if (stats.count === 0 || !stats.largest) {
    return {
      id: 'quakes',
      parts: [`Nenhum terremoto M${mag}+ ${WINDOW_LABEL[options.window]}.`],
    };
  }
  const { largest } = stats;
  const parts: Part[] = [
    { strong: fmtInt(stats.count) },
    ` ${plural(stats.count, 'terremoto', 'terremotos')} M${mag}+ ${WINDOW_LABEL[options.window]}. O maior: `,
    { strong: `M${fmtDec(largest.mag, 1)}` },
    ` — ${placePt(largest.place)} (${fmtRelative(largest.time, options.now)}).`,
  ];
  if (stats.m6plus > 0) {
    parts.push(
      ` ${fmtInt(stats.m6plus)} ${plural(stats.m6plus, 'evento', 'eventos')} de magnitude 6 ou mais.`,
    );
  }
  return { id: 'quakes', parts };
}

export function describeFires(snapshot: FireSnapshot): Insight {
  const leaders = snapshot.byState
    .slice(0, 3)
    .map((s) => `${s.state} (${fmtInt(s.count)})`)
    .join(', ');
  return {
    id: 'fires',
    parts: [
      'Brasil: ',
      { strong: fmtInt(snapshot.total) },
      ` focos de calor detectados nas últimas 24 h (nas 24 h anteriores: ${fmtInt(snapshot.previousTotal)}). `,
      leaders ? `Líderes: ${leaders}. ` : '',
      `Última detecção às ${fmtBrasilia(snapshot.latestDetection)}.`,
    ],
  };
}

export const CATEGORY_LABEL: Record<NaturalEvent['category'], { one: string; many: string }> = {
  severeStorms: { one: 'tempestade severa', many: 'tempestades severas' },
  volcanoes: { one: 'vulcão ativo', many: 'vulcões ativos' },
  seaLakeIce: { one: 'iceberg ou gelo marinho', many: 'icebergs e gelo marinho' },
  wildfires: { one: 'incêndio', many: 'incêndios' },
  other: { one: 'outro evento', many: 'outros eventos' },
};

export function countByCategory(events: NaturalEvent[]): Map<NaturalEvent['category'], number> {
  const counts = new Map<NaturalEvent['category'], number>();
  for (const e of events) counts.set(e.category, (counts.get(e.category) ?? 0) + 1);
  return counts;
}

export function describeEvents(events: NaturalEvent[]): Insight {
  const counts = countByCategory(events);
  const order: NaturalEvent['category'][] = [
    'severeStorms',
    'wildfires',
    'volcanoes',
    'seaLakeIce',
    'other',
  ];
  const parts: Part[] = ['A NASA acompanha '];
  const listed = order.filter((c) => (counts.get(c) ?? 0) > 0);
  listed.forEach((c, i) => {
    const n = counts.get(c) ?? 0;
    const label = CATEGORY_LABEL[c];
    if (i > 0) parts.push(i === listed.length - 1 ? ' e ' : ', ');
    parts.push({ strong: fmtInt(n) }, ` ${plural(n, label.one, label.many)}`);
  });
  if (listed.length === 0) return { id: 'events', parts: ['Nenhum evento natural aberto no momento.'] };
  parts.push('.');
  return { id: 'events', parts };
}

/** Maior vento (nós) entre as tempestades, para a manchete de ciclones. */
export function strongestStorm(events: NaturalEvent[]): NaturalEvent | null {
  let best: NaturalEvent | null = null;
  for (const e of events) {
    if (e.category !== 'severeStorms' || e.magnitude?.unit !== 'kts') continue;
    if (!best || (e.magnitude?.value ?? 0) > (best.magnitude?.value ?? 0)) best = e;
  }
  return best;
}

export function describeStorm(storm: NaturalEvent, now: number): Insight {
  const knots = storm.magnitude?.value ?? 0;
  return {
    id: 'storms',
    parts: [
      'Tempestade mais intensa: ',
      { strong: storm.title },
      ` — ventos de ${fmtInt(knots)} nós (${fmtInt(knots * 1.852)} km/h), posição ${fmtRelative(storm.time, now)}.`,
    ],
  };
}

export interface InsightInput {
  quakes: Quake[] | null;
  events: NaturalEvent[] | null;
  fires: FireSnapshot | null;
  window: QuakeWindow;
  minMag: number;
  now: number;
}

/** "Leitura do dia": frases geradas só a partir de dados que carregaram. */
export function buildInsights(input: InsightInput): Insight[] {
  const out: Insight[] = [];
  const { now, window, minMag } = input;
  if (input.quakes) {
    const filtered = filterQuakes(input.quakes, { window, minMag, now });
    out.push(describeQuakes(quakeStats(filtered, now), { window, minMag, now }));
  }
  if (input.fires) out.push(describeFires(input.fires));
  if (input.events) {
    const storm = strongestStorm(input.events);
    if (storm) out.push(describeStorm(storm, now));
    out.push(describeEvents(input.events));
  }
  return out;
}
