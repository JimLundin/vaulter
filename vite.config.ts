/// <reference types="vitest/config" />
// The browser app (app/) and the tests for it.
import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';

const SITE = fileURLToPath(new URL('.', import.meta.url));

// The built page's Content Security Policy: script only from the app itself (no eval, no inline), network
// only to GitHub, OpenAI, Jina (the agent's web tools: they fetch pages, the browser never does), the map
// tiles, and for a capture's metadata OpenStreetMap's geocoder (an address) and open-meteo (the weather). Styles may be inline (React style props, Shiki's colours).
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
      `connect-src 'self' ${api} ${ai} https://s.jina.ai https://r.jina.ai https://nominatim.openstreetmap.org https://api.open-meteo.com`,
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

// Dev skips the password: the secrets come from the environment or .env.local (the names CI seals), and only
// `npm run dev` gets them; a build has none, so no token reaches dist/.
const devSecrets = (mode: string) => {
  const env = { ...loadEnv(mode, SITE, 'VAULT_'), ...process.env };
  return env.VAULT_GITHUB_TOKEN
    ? {
        github: env.VAULT_GITHUB_TOKEN,
        openai: env.VAULT_OPENAI_KEY || undefined,
        jina: env.VAULT_JINA_KEY || undefined,
      }
    : null;
};

const entries = (design: boolean): Record<string, string> =>
  design
    ? { preview: fileURLToPath(new URL('app/preview/index.html', import.meta.url)) }
    : {
        index: fileURLToPath(new URL('app/index.html', import.meta.url)),
        sw: fileURLToPath(new URL('app/ui/sw.ts', import.meta.url)),
      };

export default defineConfig(({ command, mode }) => ({
  root: 'app',
  base: './',
  plugins: [react(), tailwindcss(), csp()],
  // shadcn/ui's imports: @/components/ui/…, @/lib/utils.
  resolve: { alias: { '@': fileURLToPath(new URL('app', import.meta.url)) } },
  build: {
    outDir: mode === 'design' ? '../dist-preview' : '../dist',
    emptyOutDir: true,
    // The service worker is its own entry at the root (its scope is the app); everything else is hashed.
    rolldownOptions: {
      input: entries(mode === 'design'),
      output: { entryFileNames: (c) => (c.name === 'sw' ? 'sw.js' : 'assets/[name]-[hash].js') },
    },
  },
  define: {
    __BUILD__: JSON.stringify(Date.now().toString(36)),
    __COMMIT__: JSON.stringify((process.env.GITHUB_SHA ?? '').slice(0, 7)),
    __DEV_SECRETS__: JSON.stringify(
      command === 'serve' && mode !== 'design' ? devSecrets(mode) : null,
    ),
  },
  test: { root: SITE, include: ['app/**/*.test.{ts,tsx}', 'tools/**/*.test.ts'] },
}));
