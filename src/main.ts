// The kernel bundle's entry. It ships the source provider's own source (compiled and sandboxed like any
// extension) and, under `npm run dev`, reads the working tree instead of a repo.
import sourceContract from '../contracts/extensions.source/index.ts?raw';
import sourceGithub from '../extensions/source-github/index.ts?raw';
import boot from './sandbox/boot.js?raw';
import { start } from './kernel/start.ts';

const dev = import.meta.env.DEV;
if (!dev && 'serviceWorker' in navigator) void navigator.serviceWorker.register('sw.js');

void (async () =>
  start({
    bundledSource: {
      'extensions/source-github/index.ts': sourceGithub,
      'contracts/extensions.source/index.ts': sourceContract,
    },
    bundled: ['source-github'],
    defaultSource: dev
      ? 'local/working-tree@working-tree'
      : import.meta.env.VITE_PIP_SOURCE || 'JimLundin/vaulter@main',
    sandbox: { boot, bundles: () => import('virtual:sandbox-bundles') },
    // Only in development: the working tree is never part of the built bundle.
    devSource: dev ? (await import('./kernel/dev-source.ts')).devSource : undefined,
  }))();
