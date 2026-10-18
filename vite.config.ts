// The browser app (app/). Test scheduling lives in vitest.config.ts.
import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';
import { previewAgent } from './tools/preview/preview-agent.ts';
import { noEval } from './tools/build/no-eval.ts';

const SITE = fileURLToPath(new URL('.', import.meta.url));

// The built page's Content Security Policy: script only from the app itself (no eval, no inline), network
// permits user-configured API transports. Styles may be inline (React style props, Shiki's colours).
const csp = (): Plugin => ({
  name: 'csp',
  apply: 'build',
  transformIndexHtml(html) {
    const policy = [
      "default-src 'none'",
      "script-src 'self'",
      "worker-src 'self'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data:",
      "connect-src 'self' https: http: wss: ws:",
      "font-src 'self'",
      // The Home Screen install reads the manifest; default-src 'none' would refuse it.
      "manifest-src 'self'",
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
      }
    : null;
};

const entries = (design: boolean): Record<string, string> =>
  design
    ? {
        preview: fileURLToPath(new URL('app/preview/index.html', import.meta.url)),
        wiki: fileURLToPath(new URL('app/preview/wiki.html', import.meta.url)),
        records: fileURLToPath(new URL('app/preview/records.html', import.meta.url)),
        search: fileURLToPath(new URL('app/preview/search.html', import.meta.url)),
        calendar: fileURLToPath(new URL('app/preview/calendar.html', import.meta.url)),
      }
    : {
        index: fileURLToPath(new URL('app/index.html', import.meta.url)),
        sw: fileURLToPath(new URL('app/runtime/sw.ts', import.meta.url)),
      };

export default defineConfig(({ command, mode }) => {
  const agent =
    command === 'serve' && mode === 'design'
      ? previewAgent({ ...loadEnv(mode, SITE, ''), ...process.env })
      : null;
  return {
    root: 'app',
    base: './',
    plugins: [noEval(), react(), tailwindcss(), csp(), ...(agent ? [agent.guard] : [])],
    worker: { plugins: () => [noEval()] },
    oxc: { target: ['chrome111', 'edge111', 'firefox114', 'safari16.4', 'ios16.4'] },
    server: { proxy: agent?.proxy },
    // The source alias is also used by the kit's component-generator configuration.
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
      __PREVIEW_AGENT__: JSON.stringify(agent?.client ?? null),
    },
  };
});
