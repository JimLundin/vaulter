import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { noEval } from '../build/no-eval.ts';

// Bundle the existing specimen URLs once instead of transforming modules on every browser load.
// The live-provider fixture intercepts its requests in Playwright; no credentials or proxy ship.
export default defineConfig({
  root: fileURLToPath(new URL('../../app', import.meta.url)),
  plugins: [noEval(), react(), tailwindcss()],
  worker: { plugins: () => [noEval()] },
  resolve: { alias: { '@': fileURLToPath(new URL('../../app', import.meta.url)) } },
  define: {
    __BUILD__: JSON.stringify('browser-test'),
    __COMMIT__: JSON.stringify(''),
    __DEV_SECRETS__: 'null',
    __PREVIEW_AGENT__: JSON.stringify({
      baseURL: '/__preview-agent/v1',
      defaultModel: 'fixture-llm',
      transcriptionModel: 'gpt-4o-transcribe',
    }),
  },
  build: {
    outDir: '../dist-browser',
    emptyOutDir: true,
    rolldownOptions: {
      input: [
        'preview/index.html',
        'preview/wiki.html',
        'preview/records.html',
        'preview/search.html',
        'ui/kit/index.html',
        'ui/kit/tests/browser.html',
        'ui/kit/tests/controls.html',
      ].map((entry) => fileURLToPath(new URL(`../../app/${entry}`, import.meta.url))),
    },
  },
});
