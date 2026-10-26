import countries from 'i18n-iso-countries';
import ptLocale from 'i18n-iso-countries/langs/pt.json';
import type { Feature, Geometry, MultiPolygon, Polygon, Position } from 'geojson';
import { feature } from 'topojson-client';
import type { GeometryCollection, Topology } from 'topojson-specification';
import atlas from 'world-atlas/countries-110m.json';

countries.registerLocale(ptLocale);

export interface CountryShape {
  /** Código numérico ISO 3166 (o id do world-atlas). */
  id: string;
  name: string;
  geometry: Polygon | MultiPolygon;
  bbox: [number, number, number, number];
}

const collection = feature(
  atlas as unknown as Topology,
  atlas.objects.countries as unknown as GeometryCollection,
);

function bboxOf(geometry: Polygon | MultiPolygon): [number, number, number, number] {
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  let [minX, minY, maxX, maxY] = [180, 90, -180, -90];
  for (const rings of polygons) {
    for (const [x, y] of rings[0] ?? []) {
      minX = Math.min(minX, x ?? 0);
      maxX = Math.max(maxX, x ?? 0);
      minY = Math.min(minY, y ?? 0);
      maxY = Math.max(maxY, y ?? 0);
    }
  }
  return [minX, minY, maxX, maxY];
}

/** Países do atlas 110m com nome oficial em português. */
export const COUNTRY_SHAPES: CountryShape[] = (collection.features as Feature<Geometry>[]).flatMap(
  (f) => {
    const geometry = f.geometry;
    const id = String(f.id ?? '');
    if (geometry.type !== 'Polygon' && geometry.type !== 'MultiPolygon') return [];
    const name = id ? (countries.getName(id, 'pt', { select: 'official' }) ?? '') : '';
    if (!name) return [];
    return [{ id, name, geometry, bbox: bboxOf(geometry) }];
  },
);

function inRing(lng: number, lat: number, ring: Position[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi = 0, yi = 0] = ring[i] ?? [];
    const [xj = 0, yj = 0] = ring[j] ?? [];
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function inPolygon(lng: number, lat: number, rings: Position[][]): boolean {
  const [outer, ...holes] = rings;
  if (!outer || !inRing(lng, lat, outer)) return false;
  return !holes.some((hole) => inRing(lng, lat, hole));
}

/** Nome do país em que o ponto cai, ou null (oceano ou ponto sem país). */
export function countryAt(lat: number, lng: number): CountryShape | null {
  for (const c of COUNTRY_SHAPES) {
    const [minX, minY, maxX, maxY] = c.bbox;
    if (lng < minX || lng > maxX || lat < minY || lat > maxY) continue;
    const hit =
      c.geometry.type === 'Polygon'
        ? inPolygon(lng, lat, c.geometry.coordinates)
        : c.geometry.coordinates.some((p) => inPolygon(lng, lat, p));
    if (hit) return c;
  }
  return null;
}
