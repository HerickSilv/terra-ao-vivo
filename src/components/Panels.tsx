import type { CSSProperties, ReactNode } from 'react';
import { type Insight, type Part } from '../insights/summarize';
import { COLOR } from '../lib/present';
import { fmtInt, fmtRelative } from '../lib/format';
import type { FireSnapshot, LayerState } from '../lib/types';

/** Rótulo de atualização e fonte, sempre visível em cada camada. */
export function SourceLine({
  name,
  state,
  now,
}: {
  name: string;
  state: Pick<LayerState<unknown>, 'status' | 'updatedAt' | 'error'>;
  now: number;
}) {
  let text: string;
  if (state.status === 'loading' && state.updatedAt === null) text = 'carregando…';
  else if (state.updatedAt !== null) text = `atualizado ${fmtRelative(state.updatedAt, now)}`;
  else text = 'sem dados';
  return (
    <span className="source-line">
      {name} · {text}
      {state.status === 'error' && <span className="source-error"> · falha na última tentativa</span>}
    </span>
  );
}

interface FigureProps {
  label: string;
  value: string | null;
  note: ReactNode;
  busy: boolean;
  failed: boolean;
}

function Figure({ label, value, note, busy, failed }: FigureProps) {
  return (
    <div className="figure" aria-busy={busy}>
      <span className="figure-label">{label}</span>
      <span className={`figure-value plate-display tnum ${busy ? 'ghost' : ''}`}>
        {failed ? '—' : busy ? '––––' : value}
      </span>
      <span className="figure-note">{failed ? 'Fonte indisponível agora' : note}</span>
    </div>
  );
}

export function Figures({
  quakes,
  quakesLoading,
  quakesFailed,
  events,
  eventsLoading,
  eventsFailed,
  fires,
  firesLoading,
  firesFailed,
  windowLabel,
  minMagLabel,
}: {
  quakes: number;
  quakesLoading: boolean;
  quakesFailed: boolean;
  events: number;
  eventsLoading: boolean;
  eventsFailed: boolean;
  fires: FireSnapshot | null;
  firesLoading: boolean;
  firesFailed: boolean;
  windowLabel: string;
  minMagLabel: string;
}) {
  return (
    <section className="figures" aria-label="Cifras ao vivo">
      <Figure
        label="Sismos"
        value={fmtInt(quakes)}
        busy={quakesLoading}
        failed={quakesFailed}
        note={`M${minMagLabel}+ ${windowLabel} · USGS`}
      />
      <Figure
        label="Eventos abertos"
        value={fmtInt(events)}
        busy={eventsLoading}
        failed={eventsFailed}
        note="Tempestades, vulcões, gelo e incêndios · NASA EONET"
      />
      <Figure
        label="Focos no Brasil"
        value={fires ? fmtInt(fires.total) : null}
        busy={firesLoading}
        failed={firesFailed}
        note={
          fires
            ? `24 h · antes: ${fmtInt(fires.previousTotal)} · INPE`
            : 'Últimas 24 h · INPE'
        }
      />
    </section>
  );
}

function renderParts(parts: Part[]) {
  return parts.map((p, i) =>
    typeof p === 'string' ? (
      <span key={i}>{p}</span>
    ) : (
      <strong key={i} className="tnum">
        {p.strong}
      </strong>
    ),
  );
}

const INSIGHT_TITLE: Record<Insight['id'], string> = {
  quakes: 'Sismos',
  fires: 'Queimadas',
  storms: 'Ciclones',
  events: 'Eventos',
};

export function Reading({
  insights,
  loading,
  quakesError,
  eventsError,
  firesError,
}: {
  insights: Insight[];
  loading: boolean;
  quakesError: string | null;
  eventsError: string | null;
  firesError: string | null;
}) {
  const errors = [quakesError, eventsError, firesError].filter(Boolean);
  return (
    <section className="reading" aria-labelledby="reading-title">
      <h2 id="reading-title" className="section-title">
        Leitura do dia
      </h2>
      {loading && insights.length === 0 && <p className="muted">Montando a leitura com os dados…</p>}
      {!loading && insights.length === 0 && (
        <p className="muted">Ainda não há dados suficientes para uma leitura.</p>
      )}
      <ul className="reading-list">
        {insights.map((i) => (
          <li key={i.id}>
            <span className="reading-kicker">{INSIGHT_TITLE[i.id]}</span>
            <p>{renderParts(i.parts)}</p>
          </li>
        ))}
      </ul>
      {errors.length > 0 && (
        <p className="notice" role="status">
          Parte da leitura não carregou: {errors.join(' ')}
        </p>
      )}
    </section>
  );
}

export function Key() {
  const items: { label: string; color: string; shape: 'dot' | 'ring' | 'hex' | 'tri' | 'diamond' }[] = [
    { label: 'Sismo (tamanho = magnitude)', color: COLOR.quake, shape: 'ring' },
    { label: 'Tempestade e trajetória', color: COLOR.storm, shape: 'dot' },
    { label: 'Vulcão ativo (triângulo)', color: COLOR.volcano, shape: 'tri' },
    { label: 'Gelo marinho e iceberg (losango)', color: COLOR.ice, shape: 'diamond' },
    { label: 'Incêndio', color: COLOR.fire, shape: 'dot' },
    { label: 'Focos INPE (hexágono, quanto mais escuro menos focos)', color: COLOR.fire, shape: 'hex' },
  ];
  return (
    <section className="key" aria-labelledby="key-title">
      <h2 id="key-title" className="section-title">
        Chave do mapa
      </h2>
      <ul className="key-list">
        {items.map((it) => (
          <li key={it.label}>
            <span className={`swatch swatch-${it.shape}`} style={{ '--swatch': it.color } as CSSProperties} aria-hidden="true" />
            {it.label}
          </li>
        ))}
      </ul>
    </section>
  );
}
