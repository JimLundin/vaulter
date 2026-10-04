// The kernel bundle's entry. It ships the source provider's own source (compiled and loaded like any
// extension), the modules every extension shares, and under `npm run dev` reads the working tree
// instead of a repo.
import * as react from 'react';
import * as jsxRuntime from 'react/jsx-runtime';
import * as reactDomClient from 'react-dom/client';
import * as zod from 'zod';
import sourceContract from '../contracts/extensions.source/index.ts?raw';
import sourceGithub from '../extensions/source-github/index.ts?raw';
import * as kernel from './kernel/api.ts';
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
      : import.meta.env.VITE_VAULTER_SOURCE || 'JimLundin/vaulter@main',
    shared: {
      '@vaulter/kernel': kernel,
      zod,
      react,
      'react/jsx-runtime': jsxRuntime,
      'react-dom/client': reactDomClient,
    },
    // Only in development: the working tree is never part of the built bundle.
    devSource: dev ? (await import('./kernel/dev-source.ts')).devSource : undefined,
  }))();
