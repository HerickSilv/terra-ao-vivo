import { describe, expect, it } from 'vitest';
import eonetSample from '../__fixtures__/eonet.sample.json';
import focosSample from '../__fixtures__/focos.sample.json';
import usgsSample from '../__fixtures__/usgs.sample.json';
import { mergeEvents, parseEonet } from './eonet';
import { parseFires } from './fires';
import { aqiBand, describeWeatherCode, parseAir, parseWeather } from './openMeteo';
import { parseUsgs } from './usgs';

describe('parseUsgs', () => {
  it('converte a amostra real e ordena do mais recente para o mais antigo', () => {
    const quakes = parseUsgs(usgsSample);
    expect(quakes).toHaveLength(5);
    const times = quakes.map((q) => q.time);
    expect([...times].sort((a, b) => b - a)).toEqual(times);
    const first = quakes[0];
    expect(first?.lat).toBeGreaterThanOrEqual(-90);
    expect(first?.url?.startsWith('https://')).toBe(true);
  });

  it('descarta itens inválidos sem derrubar o resto', () => {
    const good = usgsSample.features[0];
    const result = parseUsgs({
      features: [
        good,
        { id: 'x', properties: { mag: null, time: 1 }, geometry: { coordinates: [0, 0, 1] } },
        { id: 'y', properties: { mag: 4, time: 1 }, geometry: { coordinates: [200, 0, 1] } },
        { nada: true },
        null,
      ],
    });
    expect(result).toHaveLength(1);
  });

  it('rejeita formato geral inesperado', () => {
    expect(() => parseUsgs({ foo: 1 })).toThrow();
    expect(() => parseUsgs(null)).toThrow();
  });

  it('bloqueia link que não seja https', () => {
    const q = parseUsgs({
      features: [
        {
          id: 'a',
          properties: { mag: 5, place: 'X', time: 1, url: 'javascript:alert(1)' },
          geometry: { coordinates: [1, 2, 3] },
        },
      ],
    });
    expect(q[0]?.url).toBeNull();
  });
});

describe('parseEonet', () => {
  const events = parseEonet(eonetSample);

  it('mapeia categorias e usa a última observação como posição', () => {
    const storm = events.find((e) => e.category === 'severeStorms');
    expect(storm).toBeDefined();
    expect(storm?.track.length).toBeGreaterThan(1);
    expect(storm?.time).toBe(storm?.track[storm.track.length - 1]?.time);
    expect(storm?.magnitude?.unit).toBe('kts');
    expect(events.some((e) => e.category === 'volcanoes')).toBe(true);
    expect(events.some((e) => e.category === 'seaLakeIce')).toBe(true);
    expect(events.some((e) => e.category === 'wildfires')).toBe(true);
  });

  it('trata geometria de polígono pelo centroide e categoria desconhecida como "other"', () => {
    const parsed = parseEonet({
      events: [
        {
          id: 'P1',
          title: 'Área',
          categories: [{ id: 'floods' }],
          geometry: [
            {
              date: '2026-10-20T00:00:00Z',
              type: 'Polygon',
              coordinates: [
                [
                  [10, 10],
                  [20, 10],
                  [20, 20],
                  [10, 20],
                ],
              ],
            },
          ],
        },
      ],
    });
    expect(parsed[0]).toMatchObject({ category: 'other', lat: 15, lng: 15 });
  });

  it('descarta evento sem posição válida e rejeita formato geral inválido', () => {
    expect(
      parseEonet({
        events: [
          {
            id: 'X',
            title: 'Sem geometria útil',
            categories: [],
            geometry: [{ date: 'ontem', type: 'Point', coordinates: [1, 2] }],
          },
        ],
      }),
    ).toEqual([]);
    expect(() => parseEonet({})).toThrow();
  });

  it('une listas sem duplicar ids', () => {
    const merged = mergeEvents(events, events);
    expect(merged).toHaveLength(events.length);
  });
});

describe('parseFires', () => {
  it('converte datas ISO e células compactas', () => {
    const snap = parseFires(focosSample);
    expect(snap.total).toBeGreaterThan(0);
    expect(snap.cells[0]).toEqual({
      lat: expect.any(Number),
      lng: expect.any(Number),
      count: expect.any(Number),
    });
    expect(snap.latestDetection).toBeLessThanOrEqual(snap.generatedAt);
    expect(snap.sourceName).toContain('INPE');
  });

  it('rejeita versão de schema desconhecida e datas inválidas', () => {
    expect(() => parseFires({ ...focosSample, schemaVersion: 2 })).toThrow();
    expect(() => parseFires({ ...focosSample, generatedAt: 'lixo' })).toThrow();
  });
});

describe('Open-Meteo', () => {
  const weatherJson = {
    current: {
      time: '2026-10-26T14:30',
      temperature_2m: 22.1,
      apparent_temperature: 22.5,
      relative_humidity_2m: 60,
      precipitation: 0,
      weather_code: 2,
      wind_speed_10m: 12,
      wind_gusts_10m: 25,
      is_day: 1,
    },
    hourly: {
      time: Array.from({ length: 30 }, (_, i) => {
        const h = (13 + i) % 24;
        const day = 26 + Math.floor((13 + i) / 24);
        return `2026-10-${day}T${String(h).padStart(2, '0')}:00`;
      }),
      temperature_2m: Array.from({ length: 30 }, (_, i) => 20 + (i % 5)),
    },
  };

  it('extrai clima atual e as próximas 24 h a partir da hora cheia', () => {
    const r = parseWeather(weatherJson);
    expect(r.weather?.temperature).toBe(22.1);
    expect(r.weather?.isDay).toBe(true);
    expect(r.hourly?.hours).toHaveLength(24);
    expect(r.hourly?.hours[0]).toBe('14:00');
  });

  it('aceita campos nulos (oceano / sem dado)', () => {
    const air = parseAir({ current: { us_aqi: null, pm10: null, pm2_5: null } });
    expect(air).toEqual({ aqi: null, pm25: null, pm10: null });
  });

  it('descreve códigos WMO em português', () => {
    expect(describeWeatherCode(0, true)).toEqual({ label: 'Céu limpo', icon: 'sun' });
    expect(describeWeatherCode(0, false).icon).toBe('moon');
    expect(describeWeatherCode(95, true).icon).toBe('storm');
    expect(describeWeatherCode(63, true).label).toBe('Chuva');
    expect(describeWeatherCode(null, true).label).toBe('Sem leitura');
  });

  it('classifica o AQI nas faixas da EPA', () => {
    expect(aqiBand(0).label).toBe('Boa');
    expect(aqiBand(50).index).toBe(0);
    expect(aqiBand(51).label).toBe('Moderada');
    expect(aqiBand(180).label).toBe('Ruim');
    expect(aqiBand(999).label).toBe('Perigosa');
  });
});
