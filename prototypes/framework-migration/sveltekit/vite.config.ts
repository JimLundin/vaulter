import { sveltekit } from '@sveltejs/kit/vite';
import adapter from '@sveltejs/adapter-static';
import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  plugins: [sveltekit({ adapter: adapter({ fallback: 'index.html' }) })],
  resolve: { alias: [
    // Prototype-only portability adapter: Tasks needs parseTime, not Calendar routing/UI.
    { find: '@/modules/calendar/index.ts', replacement: fileURLToPath(new URL('../../../app/modules/calendar/time.ts', import.meta.url)) },
    { find: '@', replacement: fileURLToPath(new URL('../../../app', import.meta.url)) },
    { find: '@prototype', replacement: fileURLToPath(new URL('../shared', import.meta.url)) },
  ] }, server: { fs: { allow: ['../../..'] } },
});
