// The page's entry: every extension in extensions/, each in a chunk of its own, imported when it is on.
import type { About } from './kernel/api.ts';
import { start } from './kernel/start.ts';

if (!import.meta.env.DEV && 'serviceWorker' in navigator)
  void navigator.serviceWorker.register('sw.js');

const id = (path: string) => path.split('/').at(-2) ?? path;
const byId = <T>(m: Record<string, T>) =>
  Object.fromEntries(Object.entries(m).map(([path, v]) => [id(path), v]));

void start({
  about: byId(
    import.meta.glob<About>('../extensions/*/about.ts', { eager: true, import: 'about' }),
  ),
  load: byId(import.meta.glob<Record<string, unknown>>('../extensions/*/index.ts')),
});
