// The kit's gallery on its own (`npm run kit`), apart from the app and its build.
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { noEval } from '../../../../tools/build/no-eval.ts';

export default defineConfig({
  base: './',
  resolve: { alias: { '@': fileURLToPath(new URL('../../../', import.meta.url)) } },
  plugins: [noEval(), react(), tailwindcss()],
  worker: { plugins: () => [noEval()] },
});
