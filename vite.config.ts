import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

/**
 * Hosts que o navegador pode chamar. Qualquer outro destino é bloqueado pela CSP.
 * Manter em sincronia com src/data/*.ts e com o README (tabela de fontes).
 */
const CONNECT_SRC = [
  "'self'",
  'https://earthquake.usgs.gov',
  'https://eonet.gsfc.nasa.gov',
  'https://api.open-meteo.com',
  'https://air-quality-api.open-meteo.com',
];

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  // 'unsafe-inline' só para estilo: o globe.gl injeta blocos <style> em tempo de execução
  // (não dá para listar hashes no build). Scripts continuam estritos: só 'self'.
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  `connect-src ${CONNECT_SRC.join(' ')}`,
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
].join('; ');

/** Injeta a CSP só no build de produção (o HMR do dev precisa de scripts inline). */
function contentSecurityPolicy(): Plugin {
  return {
    name: 'terra-csp',
    apply: 'build',
    transformIndexHtml(html) {
      return html.replace(
        '<!--CSP-->',
        `<meta http-equiv="Content-Security-Policy" content="${CSP}" />`,
      );
    },
  };
}

export default defineConfig({
  // No GitHub Pages o app vive em /<repositorio>/; o workflow passa VITE_BASE.
  base: process.env.VITE_BASE ?? '/',
  plugins: [react(), tailwindcss(), contentSecurityPolicy()],
  build: {
    target: 'es2022',
    // sem data: URIs embutidos: a CSP de img/font fica restrita ao mesmo domínio
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 1200,
  },
  server: { host: '127.0.0.1' },
  preview: { host: '127.0.0.1' },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
