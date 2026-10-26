const INT = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });

export const fmtInt = (n: number): string => INT.format(Math.round(n));

export function fmtDec(n: number, digits = 1): string {
  return n.toLocaleString('pt-BR', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

/** "há 3 h", "há 12 min", "agora". */
export function fmtRelative(ts: number, now: number): string {
  const seconds = Math.max(0, Math.round((now - ts) / 1000));
  if (seconds < 45) return 'agora';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.round(seconds / 3600);
  if (hours < 48) return `há ${hours} h`;
  return `há ${Math.round(seconds / 86400)} d`;
}

const CLOCK = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

const CLOCK_BRT = new Intl.DateTimeFormat('pt-BR', {
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'America/Sao_Paulo',
});

/** "26/10, 14:30" no fuso do navegador. */
export const fmtClock = (ts: number): string => CLOCK.format(ts).replace(' ', ', ');

/** "14:30" em horário de Brasília. */
export const fmtBrasilia = (ts: number): string => `${CLOCK_BRT.format(ts)} (Brasília)`;

function dmsPart(value: number, pos: string, neg: string, pad: number): string {
  const abs = Math.abs(value);
  let deg = Math.floor(abs);
  let min = Math.round((abs - deg) * 60);
  if (min === 60) {
    deg += 1;
    min = 0;
  }
  const hemi = value >= 0 ? pos : neg;
  return `${String(deg).padStart(pad, '0')}°${String(min).padStart(2, '0')}′${hemi}`;
}

/** Coordenadas em graus e minutos, hemisférios em português (L = leste, O = oeste). */
export function fmtCoords(lat: number, lng: number): string {
  return `${dmsPart(lat, 'N', 'S', 2)} ${dmsPart(lng, 'L', 'O', 3)}`;
}

/** Normaliza longitude para [-180, 180]. */
export function wrapLng(lng: number): number {
  return ((((lng + 180) % 360) + 360) % 360) - 180;
}

const COMPASS: Record<string, string> = {
  N: 'N',
  NNE: 'NNL',
  NE: 'NE',
  ENE: 'LNE',
  E: 'L',
  ESE: 'LSE',
  SE: 'SE',
  SSE: 'SSE',
  S: 'S',
  SSW: 'SSO',
  SW: 'SO',
  WSW: 'OSO',
  W: 'O',
  WNW: 'ONO',
  NW: 'NO',
  NNW: 'NNO',
};

/** "205 km NW of Port-Olry, Vanuatu" → "205 km a NO de Port-Olry, Vanuatu". */
export function placePt(place: string): string {
  const match = /^(\d+) km ([NSEW]{1,3}) of (.+)$/.exec(place);
  if (!match) return place;
  const [, km, dir, rest] = match;
  return `${km} km a ${COMPASS[dir ?? ''] ?? dir} de ${rest}`;
}

/** Último trecho depois da vírgula, normalmente o país ou a região. */
export function shortPlace(place: string): string {
  const parts = place.split(',');
  return (parts[parts.length - 1] ?? place).trim();
}
