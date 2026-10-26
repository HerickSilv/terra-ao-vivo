export class HttpError extends Error {
  readonly status: number | undefined;

  constructor(message: string, status?: number) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
  }
}

export const isAbort = (error: unknown): boolean =>
  error instanceof DOMException && error.name === 'AbortError';

interface FetchOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  cache?: RequestCache;
}

/** GET JSON com tempo limite. Sem cabeçalhos extras, para não disparar preflight de CORS. */
export async function fetchJson(url: string, options: FetchOptions = {}): Promise<unknown> {
  const timeout = AbortSignal.timeout(options.timeoutMs ?? 20_000);
  const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
  let response: Response;
  try {
    response = await fetch(url, { signal, cache: options.cache });
  } catch (error) {
    if (options.signal?.aborted) throw error;
    throw new HttpError('Sem resposta da fonte (rede ou tempo esgotado)');
  }
  if (!response.ok) throw new HttpError(`A fonte respondeu HTTP ${response.status}`, response.status);
  try {
    return await response.json();
  } catch {
    throw new HttpError('A fonte devolveu algo que não é JSON válido');
  }
}
