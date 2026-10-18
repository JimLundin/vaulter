import { solidStart } from '@solidjs/start/config';
import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
export default defineConfig({ plugins: [solidStart({ ssr: false })], resolve: { alias: { '@/modules/calendar/index.ts': fileURLToPath(new URL('../../../app/modules/calendar/time.ts', import.meta.url)), '@': fileURLToPath(new URL('../../../app', import.meta.url)), '@prototype': fileURLToPath(new URL('../shared', import.meta.url)) } }, server: { fs: { allow: ['../../..'] } } });
