import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { fetchEvents, mergeEvents } from './data/eonet';
import { fetchFires } from './data/fires';
import { fetchProbe } from './data/openMeteo';
import { fetchQuakes } from './data/usgs';
import { isAbort } from './data/http';
import { useLayer } from './hooks/useLayer';
import { hasWebGL, useNow, useReducedMotion } from './hooks/device';
import { buildInsights, filterQuakes, WINDOW_LABEL } from './insights/summarize';
import { countryAt } from './lib/geo';
import { fmtCoords, fmtDec, fmtRelative } from './lib/format';
import type { FocusTarget, PlaceProbe, Quake, QuakeWindow } from './lib/types';
import type { Focus, Marker } from './components/Globe';
import { Figures, Key, Reading } from './components/Panels';
import { CATEGORY_COLOR, COLOR, quakeTitle } from './lib/present';
import {
  Controls,
  ErrorNote,
  ListView,
  Selection,
  type LayerKey,
  type ProbeState,
} from './components/Interactive';

const GlobeView = lazy(() => import('./components/Globe'));

interface ProbeResult {
  key: string;
  status: 'ok' | 'error';
  data: PlaceProbe | null;
  error: string | null;
}

const EMPTY_PROBE: ProbeState = { status: 'loading', data: null, error: null };

function layerDetail(name: string, status: string, updatedAt: number | null, now: number, hasData: boolean): string {
  if (status === 'error') {
    return `${name} · falha na última tentativa${hasData ? ', mostrando o último dado bom' : ''}`;
  }
  if (updatedAt === null) return `${name} · carregando…`;
  return `${name} · atualizado ${fmtRelative(updatedAt, now)}`;
}

function isTypingTarget(t: EventTarget | null): boolean {
  return t instanceof HTMLElement && (t.isContentEditable || ['INPUT', 'SELECT', 'TEXTAREA'].includes(t.tagName));
}

export default function App() {
  const [webgl] = useState(hasWebGL);
  const reducedMotion = useReducedMotion();
  const now = useNow();

  const quakesLayer = useLayer(fetchQuakes);
  const eventsLayer = useLayer(fetchEvents);
  const firesLayer = useLayer(fetchFires);

  const [windowKey, setWindowKey] = useState<QuakeWindow>('7d');
  const [minMag, setMinMag] = useState(4.5);
  const [visible, setVisible] = useState<Record<LayerKey, boolean>>({
    quakes: true,
    events: true,
    fires: true,
  });
  const [selected, setSelected] = useState<FocusTarget | null>(null);
  const [focus, setFocus] = useState<Focus | null>(null);
  const [probeResult, setProbeResult] = useState<ProbeResult | null>(null);
  const [view, setView] = useState<{ lat: number; lng: number } | null>(null);

  const placeLat = selected?.kind === 'place' ? selected.lat : null;
  const placeLng = selected?.kind === 'place' ? selected.lng : null;

  // Clima e ar do ponto clicado. Cancelado se o visitante escolhe outro ponto antes.
  useEffect(() => {
    if (placeLat === null || placeLng === null) return;
    const controller = new AbortController();
    const key = `${placeLat},${placeLng}`;
    const label = countryAt(placeLat, placeLng)?.name ?? null;
    fetchProbe(placeLat, placeLng, label, controller.signal).then(
      (data) => {
        if (!controller.signal.aborted) setProbeResult({ key, status: 'ok', data, error: null });
      },
      (err: unknown) => {
        if (controller.signal.aborted || isAbort(err)) return;
        const error = err instanceof Error ? err.message : 'erro desconhecido';
        setProbeResult({ key, status: 'error', data: null, error });
      },
    );
    return () => controller.abort();
  }, [placeLat, placeLng]);

  const probeKey = placeLat === null || placeLng === null ? null : `${placeLat},${placeLng}`;
  const probe: ProbeState =
    probeResult && probeResult.key === probeKey
      ? { status: probeResult.status, data: probeResult.data, error: probeResult.error }
      : EMPTY_PROBE;

  const quakesById = useMemo(
    () => new Map((quakesLayer.data ?? []).map((q) => [q.id, q] as const)),
    [quakesLayer.data],
  );
  const eventsAll = useMemo(() => mergeEvents(eventsLayer.data ?? []), [eventsLayer.data]);
  const eventsById = useMemo(() => new Map(eventsAll.map((e) => [e.id, e] as const)), [eventsAll]);

  const quakes: Quake[] = useMemo(
    () => filterQuakes(quakesLayer.data ?? [], { window: windowKey, minMag, now }),
    [quakesLayer.data, windowKey, minMag, now],
  );

  const insights = useMemo(
    () =>
      buildInsights({
        quakes: quakesLayer.data,
        events: eventsLayer.data,
        fires: firesLayer.data,
        window: windowKey,
        minMag,
        now,
      }),
    [quakesLayer.data, eventsLayer.data, firesLayer.data, windowKey, minMag, now],
  );

  const markers: Marker[] = useMemo(() => {
    const out: Marker[] = [];
    if (visible.quakes) {
      for (const q of quakes) {
        out.push({
          id: `quake:${q.id}`,
          lat: q.lat,
          lng: q.lng,
          size: 0.16 + Math.max(0, q.mag - 2.5) * 0.12,
          color: COLOR.quake,
          label: quakeTitle(q),
          target: { kind: 'quake', id: q.id },
        });
      }
    }
    if (visible.events) {
      for (const e of eventsAll) {
        out.push({
          id: `event:${e.id}`,
          lat: e.lat,
          lng: e.lng,
          size: e.category === 'severeStorms' ? 0.5 : 0.36,
          color: CATEGORY_COLOR[e.category],
          shape:
            e.category === 'volcanoes' ? 'triangle' : e.category === 'seaLakeIce' ? 'diamond' : undefined,
          label: e.title,
          target: { kind: 'event', id: e.id },
        });
      }
    }
    // Marca o ponto clicado: um anel claro, para o visitante ver onde está a leitura do clima.
    if (selected?.kind === 'place') {
      out.push({
        id: 'place',
        lat: selected.lat,
        lng: selected.lng,
        size: 0.42,
        color: COLOR.select,
        label: 'Ponto consultado',
        target: selected,
      });
    }
    return out;
  }, [quakes, eventsAll, visible.quakes, visible.events, selected]);

  const tracks = useMemo(
    () => (visible.events ? eventsAll.filter((e) => e.track.length > 1).map((e) => e.track) : []),
    [eventsAll, visible.events],
  );

  const handleTarget = useCallback(
    (target: FocusTarget, pan: boolean) => {
      setSelected(target);
      if (!pan) return;
      const item: { lat: number; lng: number } | undefined =
        target.kind === 'quake'
          ? quakesById.get(target.id)
          : target.kind === 'event'
            ? eventsById.get(target.id)
            : undefined;
      if (item) setFocus((f) => ({ key: (f?.key ?? 0) + 1, lat: item.lat, lng: item.lng, altitude: 1.6 }));
    },
    [quakesById, eventsById],
  );

  const handlePlace = useCallback((lat: number, lng: number) => {
    setSelected({ kind: 'place', lat, lng });
  }, []);

  // Foco vai para o painel de detalhes: leitor de tela e teclado percebem a seleção, e no celular ele aparece.
  useEffect(() => {
    if (!selected) return;
    const el = document.getElementById('selection');
    el?.focus({ preventScroll: window.matchMedia('(min-width: 1024px)').matches });
  }, [selected]);

  const toggle = useCallback((k: LayerKey) => setVisible((v) => ({ ...v, [k]: !v[k] })), []);

  // Atalhos 1/2/3 para as camadas e Esc para fechar o painel de detalhes.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || isTypingTarget(e.target)) return;
      if (e.key === '1') toggle('quakes');
      else if (e.key === '2') toggle('events');
      else if (e.key === '3') toggle('fires');
      else if (e.key === 'Escape') setSelected(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggle]);

  const selectedQuake = selected?.kind === 'quake' ? (quakesById.get(selected.id) ?? null) : null;
  const selectedEvent = selected?.kind === 'event' ? (eventsById.get(selected.id) ?? null) : null;
  const selectedPlace =
    selected?.kind === 'place'
      ? { lat: selected.lat, lng: selected.lng, country: countryAt(selected.lat, selected.lng)?.name ?? null }
      : null;
  const activeId = selected?.kind === 'quake' || selected?.kind === 'event' ? selected.id : null;

  const quakesFailed = quakesLayer.status === 'error' && quakesLayer.data === null;
  const eventsFailed = eventsLayer.status === 'error' && eventsLayer.data === null;
  const firesFailed = firesLayer.status === 'error' && firesLayer.data === null;
  const windowLabel = WINDOW_LABEL[windowKey];
  const minMagLabel = fmtDec(minMag, 1);

  const summary =
    `Globo: ${quakes.length} sismos M${minMagLabel}+ ${windowLabel}` +
    `, ${eventsAll.length} eventos abertos` +
    (firesLayer.data ? `, ${firesLayer.data.total} focos de queimada no Brasil nas últimas 24 h` : '') +
    '. A lista ao lado tem os mesmos itens, para teclado e leitores de tela.';

  const statusOf = {
    quakes: {
      name: 'quakes',
      detail: layerDetail('USGS', quakesLayer.status, quakesLayer.updatedAt, now, quakesLayer.data !== null),
    },
    events: {
      name: 'events',
      detail: layerDetail('NASA EONET', eventsLayer.status, eventsLayer.updatedAt, now, eventsLayer.data !== null),
    },
    fires: {
      name: 'fires',
      detail: layerDetail('INPE', firesLayer.status, firesLayer.updatedAt, now, firesLayer.data !== null),
    },
  };

  const updatedNewest = Math.max(
    quakesLayer.updatedAt ?? 0,
    eventsLayer.updatedAt ?? 0,
    firesLayer.updatedAt ?? 0,
  );

  const centerLabel = view ? fmtCoords(view.lat, view.lng) : null;

  return (
    <div className={`stage ${webgl ? '' : 'stage-nogl'}`}>
      <div className="neatline" aria-hidden="true" />

      <header className="masthead">
        <h1 className="plate-display title">Terra ao Vivo</h1>
        <p className="deck">
          O planeta agora: terremotos, eventos naturais e focos de queimada no Brasil, com clima e ar de qualquer ponto.
        </p>
        <p className="stamp tnum" role="status">
          {updatedNewest ? `Dados atualizados ${fmtRelative(updatedNewest, now)}` : 'Buscando os dados…'}
        </p>
      </header>

      <Figures
        quakes={quakes.length}
        quakesLoading={quakesLayer.data === null && quakesLayer.status === 'loading'}
        quakesFailed={quakesFailed}
        events={eventsAll.length}
        eventsLoading={eventsLayer.data === null && eventsLayer.status === 'loading'}
        eventsFailed={eventsFailed}
        fires={firesLayer.data}
        firesLoading={firesLayer.data === null && firesLayer.status === 'loading'}
        firesFailed={firesFailed}
        windowLabel={windowLabel}
        minMagLabel={minMagLabel}
      />

      <div className="globe-wrap">
        {webgl ? (
          <Suspense fallback={<p className="globe-loading muted">Preparando o globo…</p>}>
            <GlobeView
              markers={markers}
              tracks={tracks}
              fires={firesLayer.data?.cells ?? []}
              showFires={visible.fires}
              focus={focus}
              reducedMotion={reducedMotion}
              onPlace={handlePlace}
              onTarget={(t) => handleTarget(t, false)}
              onView={(lat, lng) => setView({ lat, lng })}
              summary={summary}
            />
          </Suspense>
        ) : (
          <div className="nogl" role="note">
            <p>Este navegador não tem WebGL, então não dá para desenhar o globo.</p>
            <p className="muted">Os mesmos dados estão em lista abaixo, com as mesmas fontes e horários.</p>
          </div>
        )}
        {webgl && (
          <p className="globe-hint" aria-hidden="true">
            Arraste para girar · clique num ponto ou país
          </p>
        )}
        {webgl && centerLabel && (
          <p className="center-coords tnum" aria-live="off">
            centro {centerLabel}
          </p>
        )}
      </div>

      <aside className="side" aria-label="Painéis">
        <Reading
          insights={insights}
          loading={quakesLayer.data === null && eventsLayer.data === null && firesLayer.data === null && !quakesFailed}
          quakesError={quakesLayer.status === 'error' ? quakesLayer.error : null}
          eventsError={eventsLayer.status === 'error' ? eventsLayer.error : null}
          firesError={firesLayer.status === 'error' ? firesLayer.error : null}
        />
        {quakesFailed && <ErrorNote label="Sismos" message={quakesLayer.error ?? 'erro'} onRetry={quakesLayer.retry} />}
        {eventsFailed && <ErrorNote label="Eventos" message={eventsLayer.error ?? 'erro'} onRetry={eventsLayer.retry} />}
        {firesFailed && <ErrorNote label="Focos" message={firesLayer.error ?? 'erro'} onRetry={firesLayer.retry} />}
        <Controls
          windowKey={windowKey}
          onWindow={setWindowKey}
          minMag={minMag}
          onMinMag={setMinMag}
          visible={visible}
          onToggle={toggle}
          statusOf={statusOf}
        />
        <Key />
              <ListView
                quakes={quakes}
                events={eventsAll}
                onTarget={(t) => handleTarget(t, true)}
                activeId={activeId}
                now={now}
                quakesLimit={150}
              />
      </aside>

      <Selection
        target={selected}
        quake={selectedQuake}
        event={selectedEvent}
        place={selectedPlace}
        probe={probe}
        now={now}
        onClose={() => setSelected(null)}
      />

    </div>
  );
}
