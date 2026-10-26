import { describe, expect, it } from 'vitest';
import eonetSample from '../__fixtures__/eonet.sample.json';
import focosSample from '../__fixtures__/focos.sample.json';
import usgsSample from '../__fixtures__/usgs.sample.json';
import { parseEonet } from '../data/eonet';
import { parseFires } from '../data/fires';
import { parseUsgs } from '../data/usgs';
import type { Part } from './summarize';
import {
  buildInsights,
  countByCategory,
  describeFires,
  describeQuakes,
  filterQuakes,
  quakeStats,
  strongestStorm,
} from './summarize';

const quakes = parseUsgs(usgsSample);
const events = parseEonet(eonetSample);
const fires = parseFires(focosSample);
const now = (quakes[0]?.time ?? 0) + 3 * 3_600_000;

const text = (parts: Part[]) => parts.map((p) => (typeof p === 'string' ? p : p.strong)).join('');

describe('filtros e estatísticas de sismos', () => {
  it('filtra por janela e magnitude mínima', () => {
    const all = filterQuakes(quakes, { window: '7d', minMag: 0, now });
    const strong = filterQuakes(quakes, { window: '7d', minMag: 5.4, now });
    expect(all.length).toBe(quakes.length);
    expect(strong.every((q) => q.mag >= 5.4)).toBe(true);
    expect(filterQuakes(quakes, { window: '24h', minMag: 0, now: now + 30 * 86_400_000 })).toEqual(
      [],
    );
  });

  it('acha o maior e conta a última hora e M6+', () => {
    const stats = quakeStats(quakes, now);
    expect(stats.largest?.mag).toBe(Math.max(...quakes.map((q) => q.mag)));
    expect(stats.count).toBe(quakes.length);
    expect(stats.lastHour).toBe(0);
    const at = (quakes[0]?.time ?? 0) + 60_000;
    const expected = quakes.filter((q) => at - q.time <= 3_600_000).length;
    expect(expected).toBeGreaterThanOrEqual(1);
    expect(quakeStats(quakes, at).lastHour).toBe(expected);
  });
});

describe('frases da leitura do dia', () => {
  it('descreve sismos com o maior evento, em pt-BR', () => {
    const window = '7d' as const;
    const stats = quakeStats(filterQuakes(quakes, { window, minMag: 4.5, now }), now);
    const insight = describeQuakes(stats, { window, minMag: 4.5, now });
    const s = text(insight.parts);
    expect(s).toContain('terremotos M4,5+ nos últimos 7 dias');
    expect(s).toContain(`M${stats.largest?.mag.toFixed(1).replace('.', ',')}`);
    expect(s).toMatch(/\d+ km a [A-Z]+ de/);
  });

  it('diz que não houve sismos quando o filtro zera a lista', () => {
    const s = text(
      describeQuakes(quakeStats([], now), { window: '24h', minMag: 6, now }).parts,
    );
    expect(s).toBe('Nenhum terremoto M6,0+ nas últimas 24 h.');
  });

  it('descreve queimadas com estados líderes e horário de Brasília', () => {
    const s = text(describeFires(fires).parts);
    expect(s).toContain('Brasil: ');
    expect(s).toContain('focos de calor detectados nas últimas 24 h');
    expect(s).toContain('Líderes: ');
    expect(s).toContain('(Brasília)');
  });

  it('acha a tempestade mais intensa e conta categorias', () => {
    const storm = strongestStorm(events);
    expect(storm?.category).toBe('severeStorms');
    const counts = countByCategory(events);
    expect(counts.get('volcanoes')).toBe(1);
  });

  it('monta a lista completa só com o que carregou', () => {
    const full = buildInsights({ quakes, events, fires, window: '7d', minMag: 4.5, now });
    expect(full.map((i) => i.id)).toEqual(['quakes', 'fires', 'storms', 'events']);
    const partial = buildInsights({
      quakes: null,
      events: null,
      fires,
      window: '24h',
      minMag: 4.5,
      now,
    });
    expect(partial.map((i) => i.id)).toEqual(['fires']);
    expect(buildInsights({ quakes: null, events: null, fires: null, window: '24h', minMag: 4.5, now })).toEqual(
      [],
    );
  });
});
