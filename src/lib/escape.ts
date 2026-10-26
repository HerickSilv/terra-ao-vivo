const MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/** Escapa texto vindo de API antes de qualquer uso como HTML (tooltips do globo). */
export function esc(text: string): string {
  return text.replace(/[&<>"']/g, (c) => MAP[c] ?? c);
}

/** Só aceita links https: — nunca javascript:, data: ou http. */
export function safeHttpsUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}
