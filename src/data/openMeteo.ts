import { z } from 'zod';
import { wrapLng } from '../lib/format';
import type { PlaceAir, PlaceProbe, PlaceWeather } from '../lib/types';
import { fetchJson, isAbort } from './http';

const FORECAST = 'https://api.open-meteo.com/v1/forecast';
const AIR = 'https://air-quality-api.open-meteo.com/v1/air-quality';

const num = z.number().nullable();

const WeatherResponse = z.object({
  current: z.object({
    time: z.string(),
    temperature_2m: num,
    apparent_temperature: num,
    relative_humidity_2m: num,
    precipitation: num,
    weather_code: num,
    wind_speed_10m: num,
    wind_gusts_10m: num,
    is_day: num,
  }),
  hourly: z.object({
    time: z.array(z.string()),
    temperature_2m: z.array(num),
  }),
});

const AirResponse = z.object({
  current: z.object({
    us_aqi: num,
    pm10: num,
    pm2_5: num,
  }),
});

export function parseWeather(json: unknown): Pick<PlaceProbe, 'localTime' | 'weather' | 'hourly'> {
  const r = WeatherResponse.parse(json);
  const c = r.current;
  const weather: PlaceWeather = {
    temperature: c.temperature_2m,
    apparent: c.apparent_temperature,
    humidity: c.relative_humidity_2m,
    precipitation: c.precipitation,
    windSpeed: c.wind_speed_10m,
    windGusts: c.wind_gusts_10m,
    code: c.weather_code,
    isDay: c.is_day !== 0,
  };
  // As próximas 24 h a partir da hora cheia atual (timezone=auto: horário local do lugar).
  const from = r.hourly.time.findIndex((t) => t >= c.time.slice(0, 13));
  const start = from < 0 ? 0 : from;
  const hours = r.hourly.time.slice(start, start + 24).map((t) => t.slice(11, 16));
  const temps = r.hourly.temperature_2m.slice(start, start + 24);
  return { localTime: c.time, weather, hourly: hours.length > 1 ? { hours, temps } : null };
}

export function parseAir(json: unknown): PlaceAir {
  const c = AirResponse.parse(json).current;
  return { aqi: c.us_aqi, pm25: c.pm2_5, pm10: c.pm10 };
}

const coord = (n: number) => n.toFixed(3);

/** Clima + qualidade do ar de um ponto. Uma das duas pode falhar sem derrubar a outra. */
export async function fetchProbe(
  lat: number,
  lng: number,
  label: string | null,
  signal: AbortSignal,
): Promise<PlaceProbe> {
  const lon = wrapLng(lng);
  const weatherUrl =
    `${FORECAST}?latitude=${coord(lat)}&longitude=${coord(lon)}` +
    '&current=temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,weather_code,wind_speed_10m,wind_gusts_10m,is_day' +
    '&hourly=temperature_2m&forecast_hours=26&timezone=auto&wind_speed_unit=kmh';
  const airUrl =
    `${AIR}?latitude=${coord(lat)}&longitude=${coord(lon)}` +
    '&current=us_aqi,pm10,pm2_5&timezone=auto';

  const [weather, air] = await Promise.allSettled([
    fetchJson(weatherUrl, { signal }).then(parseWeather),
    fetchJson(airUrl, { signal }).then(parseAir),
  ]);

  if (signal.aborted) throw new DOMException('Abortado', 'AbortError');
  if (weather.status === 'rejected' && air.status === 'rejected') {
    throw isAbort(weather.reason) ? weather.reason : new Error('Sem dados de clima para este ponto');
  }

  return {
    lat,
    lng: lon,
    label,
    localTime: weather.status === 'fulfilled' ? weather.value.localTime : null,
    weather: weather.status === 'fulfilled' ? weather.value.weather : null,
    hourly: weather.status === 'fulfilled' ? weather.value.hourly : null,
    air: air.status === 'fulfilled' ? air.value : null,
  };
}

export type WeatherIcon = 'sun' | 'moon' | 'cloud-sun' | 'cloud' | 'fog' | 'rain' | 'snow' | 'storm';

/** Códigos WMO usados pelo Open-Meteo → rótulo em português e ícone. */
export function describeWeatherCode(
  code: number | null,
  isDay: boolean,
): { label: string; icon: WeatherIcon } {
  if (code === null) return { label: 'Sem leitura', icon: 'cloud' };
  if (code === 0) return { label: 'Céu limpo', icon: isDay ? 'sun' : 'moon' };
  if (code === 1) return { label: 'Poucas nuvens', icon: isDay ? 'cloud-sun' : 'moon' };
  if (code === 2) return { label: 'Parcialmente nublado', icon: 'cloud-sun' };
  if (code === 3) return { label: 'Nublado', icon: 'cloud' };
  if (code === 45 || code === 48) return { label: 'Nevoeiro', icon: 'fog' };
  if (code >= 51 && code <= 55) return { label: 'Garoa', icon: 'rain' };
  if (code === 56 || code === 57) return { label: 'Garoa congelante', icon: 'rain' };
  if (code >= 61 && code <= 65) return { label: 'Chuva', icon: 'rain' };
  if (code === 66 || code === 67) return { label: 'Chuva congelante', icon: 'rain' };
  if ((code >= 71 && code <= 75) || code === 77) return { label: 'Neve', icon: 'snow' };
  if (code >= 80 && code <= 82) return { label: 'Pancadas de chuva', icon: 'rain' };
  if (code === 85 || code === 86) return { label: 'Pancadas de neve', icon: 'snow' };
  if (code === 95) return { label: 'Trovoadas', icon: 'storm' };
  if (code === 96 || code === 99) return { label: 'Trovoadas com granizo', icon: 'storm' };
  return { label: 'Condição variável', icon: 'cloud' };
}

export interface AqiBand {
  index: number;
  label: string;
}

/** Faixas do AQI dos EUA (EPA), as mesmas que o Open-Meteo usa em `us_aqi`. */
export const AQI_BANDS: { max: number; label: string }[] = [
  { max: 50, label: 'Boa' },
  { max: 100, label: 'Moderada' },
  { max: 150, label: 'Ruim para grupos sensíveis' },
  { max: 200, label: 'Ruim' },
  { max: 300, label: 'Muito ruim' },
  { max: Number.POSITIVE_INFINITY, label: 'Perigosa' },
];

export function aqiBand(aqi: number): AqiBand {
  const index = AQI_BANDS.findIndex((b) => aqi <= b.max);
  const i = index < 0 ? AQI_BANDS.length - 1 : index;
  return { index: i, label: AQI_BANDS[i]?.label ?? 'Perigosa' };
}
