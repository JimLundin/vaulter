// The kernel bundle's entry. It ships the bootstrap source provider (source-dev under `npm run dev`,
// source-github otherwise) and the modules every compiled extension shares; everything else is
// compiled from the repo at startup.
import * as React from 'react';
import * as jsxRuntime from 'react/jsx-runtime';
import * as reactDomClient from 'react-dom/client';
import * as zod from 'zod';
import sourceDev from '../extensions/source-dev/index.ts';
import sourceGithub from '../extensions/source-github/index.ts';
import * as kernel from './kernel/api.ts';
import { start } from './kernel/start.ts';

void start({
  bootstrap: [import.meta.env.DEV ? sourceDev : sourceGithub],
  bundled: ['source-dev', 'source-github'],
  defaultSource: import.meta.env.DEV
    ? 'local/working-tree@working-tree'
    : import.meta.env.VITE_PIP_SOURCE || 'JimLundin/vaulter@main',
  shared: {
    '@pip/kernel': kernel,
    zod,
    react: React,
    'react/jsx-runtime': jsxRuntime,
    'react-dom/client': reactDomClient,
  },
});
