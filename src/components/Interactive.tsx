import { useState, type CSSProperties, type ReactNode } from 'react';
import { CloudFog, CloudLightning, CloudRain, CloudSnow, Cloud, CloudSun, Moon, Sun, X } from 'lucide-react';
import type { WeatherIcon } from '../data/openMeteo';
import { aqiBand, describeWeatherCode } from '../data/openMeteo';
import { fmtCoords, fmtDec, fmtInt, fmtRelative } from '../lib/format';
import { safeHttpsUrl } from '../lib/escape';
import type { FocusTarget, NaturalEvent, PlaceProbe, Quake, QuakeWindow } from '../lib/types';
import { CATEGORY_LABEL } from '../insights/summarize';
import { CATEGORY_COLOR, MIN_MAG_OPTIONS, WINDOW_OPTIONS, eventMagnitude, quakeTitle, quakeWhen } from '../lib/present';

const ICONS: Record<WeatherIcon, typeof Sun> = {
  sun: Sun,
  moon: Moon,
  'cloud-sun': CloudSun,
  cloud: Cloud,
  fog: CloudFog,
  rain: CloudRain,
  snow: CloudSnow,
  storm: CloudLightning,
};

export type LayerKey = 'quakes' | 'events' | 'fires';

export function Controls({
  windowKey,
  onWindow,
  minMag,
  onMinMag,
  visible,
  onToggle,
  statusOf,
}: {
  windowKey: QuakeWindow;
  onWindow: (w: QuakeWindow) => void;
  minMag: number;
  onMinMag: (m: number) => void;
  visible: Record<LayerKey, boolean>;
  onToggle: (k: LayerKey) => void;
  statusOf: Record<LayerKey, { name: string; detail: string }>;
}) {
  const layers: { key: LayerKey; index: number; label: string }[] = [
    { key: 'quakes', index: 1, label: 'Sismos' },
    { key: 'events', index: 2, label: 'Eventos' },
    { key: 'fires', index: 3, label: 'Focos (Brasil)' },
  ];
  return (
    <section className="controls" aria-labelledby="controls-title">
      <h2 id="controls-title" className="section-title">
        Camadas e filtros
      </h2>
      <ul className="layer-list">
        {layers.map((l) => (
          <li key={l.key}>
            <button
              type="button"
              className="layer-toggle"
              aria-pressed={visible[l.key]}
              aria-keyshortcuts={String(l.index)}
              onClick={() => onToggle(l.key)}
            >
              <span className="layer-index tnum" aria-hidden="true">
                {l.index}
              </span>
              <span className="layer-name">{l.label}</span>
              <span className="layer-state">{visible[l.key] ? 'visível' : 'oculta'}</span>
            </button>
            <p className="layer-detail">{statusOf[l.key].detail}</p>
          </li>
        ))}
      </ul>
      <div className="filter-row">
        <div className="seg" role="group" aria-label="Janela dos sismos">
          {WINDOW_OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              aria-pressed={windowKey === o.value}
              onClick={() => onWindow(o.value)}
            >
              {o.label}
            </button>
          ))}
        </div>
        <label className="select-wrap">
          <span>Magnitude mínima</span>
          <select value={minMag} onChange={(e) => onMinMag(Number(e.target.value))}>
            {MIN_MAG_OPTIONS.map((m) => (
              <option key={m} value={m}>
                M{fmtDec(m, 1)}+
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="hint">Atalhos: 1, 2 e 3 alternam as camadas.</p>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat">
      <dt>{label}</dt>
      <dd className="tnum">{value}</dd>
    </div>
  );
}

function TempChart({ probe }: { probe: PlaceProbe }) {
  const [hover, setHover] = useState<number | null>(null);
  const hourly = probe.hourly;
  if (!hourly) return null;
  const vals = hourly.temps.filter((t): t is number => t !== null);
  if (vals.length < 2) return null;
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const span = max - min || 1;
  const W = 300;
  const H = 84;
  const n = hourly.temps.length;
  const xy = (i: number, t: number | null) => {
    const x = (i / (n - 1)) * W;
    const y = t === null ? H : 8 + (1 - (t - min) / span) * (H - 16);
    return [x, y] as const;
  };
  const path = hourly.temps
    .map((t, i) => {
      const [x, y] = xy(i, t);
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  const minIdx = hourly.temps.indexOf(min);
  const maxIdx = hourly.temps.indexOf(max);
  const hoverTemp = hover !== null ? hourly.temps[hover] : null;
  return (
    <figure className="temp-chart">
      <figcaption className="muted">
        Próximas 24 h: mínima {fmtDec(min, 1)} °C às {hourly.hours[minIdx]}, máxima {fmtDec(max, 1)} °C às{' '}
        {hourly.hours[maxIdx]}
      </figcaption>
      <div className="chart-box" onPointerLeave={() => setHover(null)}>
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="Temperatura nas próximas 24 horas">
          <path d={path} className="temp-line" vectorEffect="non-scaling-stroke" />
          {hover !== null && (
            <line
              x1={xy(hover, 0)[0]}
              x2={xy(hover, 0)[0]}
              y1={0}
              y2={H}
              className="crosshair"
              vectorEffect="non-scaling-stroke"
            />
          )}
        </svg>
        <div className="chart-hit" aria-hidden="true">
          {hourly.temps.map((_, i) => (
            <span
              key={i}
              onPointerEnter={() => setHover(i)}
              className="chart-col"
            />
          ))}
        </div>
      </div>
      <div className="chart-axis tnum" aria-hidden="true">
        <span>{hourly.hours[0]}</span>
        <span>{hover !== null ? `${hourly.hours[hover]} · ${hoverTemp === null || hoverTemp === undefined ? '—' : fmtDec(hoverTemp, 1) + ' °C'}` : ''}</span>
        <span>{hourly.hours[n - 1]}</span>
      </div>
      <details className="table-alt">
        <summary>Ver valores por hora</summary>
        <table>
          <thead>
            <tr>
              <th scope="col">Hora</th>
              <th scope="col">Temperatura</th>
            </tr>
          </thead>
          <tbody>
            {hourly.hours.map((h, i) => (
              <tr key={h}>
                <th scope="row" className="tnum">
                  {h}
                </th>
                <td className="tnum">
                  {hourly.temps[i] === null || hourly.temps[i] === undefined ? '—' : `${fmtDec(hourly.temps[i] as number, 1)} °C`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}

export type ProbeState = {
  status: 'loading' | 'ok' | 'error';
  data: PlaceProbe | null;
  error: string | null;
};

function ProbeBlock({ probe }: { probe: ProbeState }) {
  if (probe.status === 'loading') {
    return (
      <p className="muted" role="status" aria-live="polite">
        Consultando clima e qualidade do ar (Open-Meteo)…
      </p>
    );
  }
  if (probe.status === 'error' || !probe.data) {
    return (
      <p className="notice" role="alert">
        Não foi possível obter o clima deste ponto: {probe.error ?? 'erro desconhecido'}.
      </p>
    );
  }
  const d = probe.data;
  const w = d.weather;
  const air = d.air;
  const desc = w ? describeWeatherCode(w.code, w.isDay) : null;
  const Icon = desc ? ICONS[desc.icon] : Cloud;
  const band = air && air.aqi !== null ? aqiBand(air.aqi) : null;
  return (
    <div className="probe" aria-live="polite">
      {w ? (
        <div className="probe-now">
          <Icon className="probe-icon" aria-hidden="true" size={36} strokeWidth={1.5} />
          <p className="probe-temp plate-display tnum">
            {w.temperature === null ? '—' : fmtDec(w.temperature, 1)}
            <span className="unit">°C</span>
          </p>
          <p className="probe-desc">
            {desc?.label}
            {d.localTime && <span className="muted"> · {d.localTime.slice(11, 16)} local</span>}
          </p>
        </div>
      ) : (
        <p className="notice">Sem leitura de clima neste ponto (pode ser oceano ou região sem estação).</p>
      )}
      {w && (
        <dl className="stats">
          <Stat label="Sensação" value={w.apparent === null ? '—' : `${fmtDec(w.apparent, 1)} °C`} />
          <Stat label="Umidade" value={w.humidity === null ? '—' : `${fmtInt(w.humidity)} %`} />
          <Stat label="Vento" value={w.windSpeed === null ? '—' : `${fmtInt(w.windSpeed)} km/h`} />
          <Stat label="Rajadas" value={w.windGusts === null ? '—' : `${fmtInt(w.windGusts)} km/h`} />
          <Stat label="Chuva agora" value={w.precipitation === null ? '—' : `${fmtDec(w.precipitation, 1)} mm`} />
        </dl>
      )}
      {d.hourly && <TempChart probe={d} />}
      <div className="air">
        <h3 className="subhead">Qualidade do ar</h3>
        {air && air.aqi !== null && band ? (
          <p>
            <span className="aqi plate-display tnum">{fmtInt(air.aqi)}</span>{' '}
            <span className="aqi-band">US AQI · {band.label}</span>
          </p>
        ) : (
          <p className="muted">Índice indisponível para este ponto.</p>
        )}
        {air && (air.pm25 !== null || air.pm10 !== null) && (
          <p className="muted tnum">
            PM2,5: {air.pm25 === null ? '—' : fmtDec(air.pm25, 1)} µg/m³ · PM10: {air.pm10 === null ? '—' : fmtDec(air.pm10, 1)} µg/m³
          </p>
        )}
      </div>
    </div>
  );
}

export function Selection({
  target,
  quake,
  event,
  place,
  probe,
  now,
  onClose,
}: {
  target: FocusTarget | null;
  quake: Quake | null;
  event: NaturalEvent | null;
  place: { lat: number; lng: number; country: string | null } | null;
  probe: ProbeState;
  now: number;
  onClose: () => void;
}) {
  if (!target) return null;
  let heading: string;
  let body: ReactNode;
  if (target.kind === 'quake') {
    if (!quake) return null;
    const url = safeHttpsUrl(quake.url);
    heading = quakeTitle(quake);
    body = (
      <>
        <p className="muted">{quakeWhen(quake, now)}</p>
        <dl className="stats">
          <Stat label="Profundidade" value={quake.depthKm === null ? 'não informada' : `${fmtDec(quake.depthKm, 1)} km`} />
          <Stat label="Coordenadas" value={fmtCoords(quake.lat, quake.lng)} />
        </dl>
        {url && (
          <p>
            <a href={url} target="_blank" rel="noopener noreferrer">
              Ver no USGS
            </a>
          </p>
        )}
      </>
    );
  } else if (target.kind === 'event') {
    if (!event) return null;
    const link = safeHttpsUrl(event.link);
    heading = event.title;
    const mag = eventMagnitude(event);
    body = (
      <>
        <p className="kind" style={{ '--kind': CATEGORY_COLOR[event.category] } as CSSProperties}>
          {CATEGORY_LABEL[event.category].one}
        </p>
        <p className="muted">Última observação {fmtRelative(event.time, now)}</p>
        <dl className="stats">
          {mag && <Stat label="Intensidade" value={mag} />}
          <Stat label="Coordenadas" value={fmtCoords(event.lat, event.lng)} />
        </dl>
        {link && (
          <p>
            <a href={link} target="_blank" rel="noopener noreferrer">
              Ver na NASA EONET
            </a>
          </p>
        )}
      </>
    );
  } else {
    if (!place) return null;
    heading = place.country ?? 'Ponto no globo';
    body = (
      <>
        <p className="muted tnum">{fmtCoords(place.lat, place.lng)}</p>
        <ProbeBlock probe={probe} />
      </>
    );
  }
  return (
    <section className="selection" aria-labelledby="selection-title" tabIndex={-1} id="selection">
      <div className="selection-head">
        <h2 id="selection-title" className="selection-title">
          {heading}
        </h2>
        <button type="button" className="icon-btn" aria-label="Fechar detalhes" onClick={onClose}>
          <X size={18} aria-hidden="true" />
        </button>
      </div>
      {body}
    </section>
  );
}

export function ListView({
  quakes,
  events,
  onTarget,
  activeId,
  now,
  quakesLimit,
}: {
  quakes: Quake[];
  events: NaturalEvent[];
  onTarget: (t: FocusTarget) => void;
  activeId: string | null;
  now: number;
  quakesLimit: number;
}) {
  const shown = quakes.slice(0, quakesLimit);
  return (
    <section id="globe-list" className="list-view" aria-label="Lista dos mesmos dados do globo">
      <details open>
        <summary>
          Sismos na lista <span className="tnum">({fmtInt(quakes.length)})</span>
        </summary>
        {quakes.length === 0 ? (
          <p className="muted">Nenhum sismo com estes filtros.</p>
        ) : (
          <ul className="item-list">
            {shown.map((q) => (
              <li key={q.id}>
                <button
                  type="button"
                  aria-current={activeId === q.id ? 'true' : undefined}
                  onClick={() => onTarget({ kind: 'quake', id: q.id })}
                >
                  <span className="item-title">{quakeTitle(q)}</span>
                  <span className="item-meta">{fmtRelative(q.time, now)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {quakes.length > shown.length && (
          <p className="muted">Mostrando {fmtInt(shown.length)} de {fmtInt(quakes.length)}.</p>
        )}
      </details>
      <details>
        <summary>
          Eventos abertos <span className="tnum">({fmtInt(events.length)})</span>
        </summary>
        {events.length === 0 ? (
          <p className="muted">Nenhum evento aberto no momento.</p>
        ) : (
          <ul className="item-list">
            {events.map((e) => (
              <li key={e.id}>
                <button
                  type="button"
                  aria-current={activeId === e.id ? 'true' : undefined}
                  onClick={() => onTarget({ kind: 'event', id: e.id })}
                >
                  <span className="item-title">{e.title}</span>
                  <span className="item-meta">{CATEGORY_LABEL[e.category].one}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </details>
    </section>
  );
}

export function ErrorNote({ label, message, onRetry }: { label: string; message: string; onRetry: () => void }) {
  return (
    <p className="notice" role="alert">
      {label}: {message}.{' '}
      <button type="button" className="text-btn" onClick={onRetry}>
        Tentar de novo
      </button>
    </p>
  );
}
