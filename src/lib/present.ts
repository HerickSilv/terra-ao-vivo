import { fmtBrasilia, fmtClock, fmtDec, fmtInt, fmtRelative, placePt } from './format';
import type { NaturalEvent, Quake, QuakeWindow } from './types';

/** Cores de categoria: mesma família do fenômeno (ver src/styles.css). */
/**
 * Tres matizes categóricos validados (validate_palette.js, superfície #061324, modo escuro):
 * ouro = terra sólida, ciano = água/ar, brasa = fogo. Vulcão e gelo são neutros e se
 * distinguem pela forma (triângulo e losango), não pela cor.
 */
export const COLOR = {
  select: '#fff5d9',
  quake: '#b39105',
  storm: '#0a9cbc',
  volcano: '#adc1cf',
  ice: '#efede4',
  fire: '#c33c00',
  other: '#7e95aa',
} as const;

export const CATEGORY_COLOR: Record<NaturalEvent['category'], string> = {
  severeStorms: COLOR.storm,
  volcanoes: COLOR.volcano,
  seaLakeIce: COLOR.ice,
  wildfires: COLOR.fire,
  other: COLOR.other,
};

export const WINDOW_OPTIONS: { value: QuakeWindow; label: string }[] = [
  { value: '24h', label: '24 h' },
  { value: '7d', label: '7 dias' },
];

export const MIN_MAG_OPTIONS = [2.5, 4.5, 6] as const;

export function quakeTitle(q: Quake): string {
  return `M${fmtDec(q.mag, 1)} · ${placePt(q.place)}`;
}

export function quakeWhen(q: Quake, now: number): string {
  return `${fmtClock(q.time)} (${fmtRelative(q.time, now)}) · ${fmtBrasilia(q.time)}`;
}

export function eventMagnitude(e: NaturalEvent): string | null {
  if (!e.magnitude) return null;
  if (e.magnitude.unit === 'kts') return `${fmtInt(e.magnitude.value)} nós`;
  return `${fmtDec(e.magnitude.value, 1)} ${e.magnitude.unit}`;
}
