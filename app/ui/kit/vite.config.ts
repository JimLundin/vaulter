// The kit's gallery on its own (`npm run kit`), apart from the app and its build.
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { noEval } from '../../../tools/no-eval.ts';

export default defineConfig({
  base: './',
  plugins: [noEval(), react(), tailwindcss()],
  worker: { plugins: () => [noEval()] },
});
