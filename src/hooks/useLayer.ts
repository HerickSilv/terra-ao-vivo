import { useCallback, useEffect, useState } from 'react';
import { isAbort } from '../data/http';
import { emptyLayer, type LayerState } from '../lib/types';

/** Intervalo de atualização enquanto a aba está visível (a PRODUCT.md promete 5 min). */
export const REFRESH_MS = 5 * 60_000;

/**
 * Carrega uma camada com cancelamento, atualização periódica e nova tentativa manual.
 * Em falha, mantém os últimos dados bons e marca o erro: a camada degrada, não some.
 */
export function useLayer<T>(load: (signal: AbortSignal) => Promise<T>) {
  const [state, setState] = useState<LayerState<T>>(() => emptyLayer<T>());
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal).then(
      (data) => {
        if (controller.signal.aborted) return;
        setState({ status: 'ok', data, updatedAt: Date.now(), error: null });
      },
      (err: unknown) => {
        if (controller.signal.aborted || isAbort(err)) return;
        const message = err instanceof Error ? err.message : 'Erro desconhecido';
        setState((prev) => ({ ...prev, status: 'error', error: message }));
      },
    );
    return () => controller.abort();
  }, [load, attempt]);

  useEffect(() => {
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') setAttempt((n) => n + 1);
    }, REFRESH_MS);
    return () => window.clearInterval(id);
  }, []);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return { ...state, retry };
}
