/// <reference types="vitest/config" />
// The browser app (app/) and the tests for it and for the shared vault code (core/).
import { defineConfig, type Plugin } from 'vite';
import preact from '@preact/preset-vite';
import { fileURLToPath } from 'node:url';

const SITE = fileURLToPath(new URL('.', import.meta.url));

// The built page's Content Security Policy: script only from the app itself (no eval, no inline), network
// only to GitHub, OpenAI, Jina (the agent's web tools: they fetch pages, the browser never does) and the map tiles. Styles may be inline (Preact style props, Shiki's colours).
const csp = (): Plugin => ({
  name: 'csp',
  apply: 'build',
  transformIndexHtml(html) {
    const api = new URL(process.env.VITE_GITHUB_API || 'https://api.github.com').origin;
    const ai = new URL(process.env.VITE_OPENAI_API || 'https://api.openai.com').origin;
    const policy = [
      "default-src 'none'",
      "script-src 'self'",
      "worker-src 'self'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https://tile.openstreetmap.org",
      `connect-src 'self' ${api} ${ai} https://s.jina.ai https://r.jina.ai`,
      "font-src 'self'",
      "base-uri 'none'",
      "form-action 'none'",
    ].join('; ');
    return html.replace(
      '<head>',
      `<head>\n  <meta http-equiv="Content-Security-Policy" content="${policy}" />`,
    );
  },
});

export default defineConfig({
  root: 'app',
  base: './',
  plugins: [preact(), csp()],
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    // The service worker is its own entry at the root (its scope is the app); everything else is hashed.
    rolldownOptions: {
      input: {
        index: fileURLToPath(new URL('app/index.html', import.meta.url)),
        sw: fileURLToPath(new URL('app/core/sw.ts', import.meta.url)),
      },
      output: { entryFileNames: (c) => (c.name === 'sw' ? 'sw.js' : 'assets/[name]-[hash].js') },
    },
  },
  define: { __BUILD__: JSON.stringify(Date.now().toString(36)) },
  test: { root: SITE, include: ['app/**/*.test.{ts,tsx}', 'core/**/*.test.ts'] },
});
