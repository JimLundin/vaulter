// The kernel bundle's entry: the page's own extensions (main), the modules every extension shares,
// and where a source provider finds drafts.
import * as react from 'react';
import * as jsxRuntime from 'react/jsx-runtime';
import * as reactDomClient from 'react-dom/client';
import * as zod from 'zod';
import * as kernel from './kernel/api.ts';
import { pageFiles } from './kernel/page-source.ts';
import { start } from './kernel/start.ts';

const dev = import.meta.env.DEV;
if (!dev && 'serviceWorker' in navigator) void navigator.serviceWorker.register('sw.js');

void start({
  page: {
    commit: dev ? 'working-tree' : import.meta.env.VITE_VAULTER_COMMIT || 'page',
    files: pageFiles,
  },
  defaultSource: import.meta.env.VITE_VAULTER_SOURCE || 'JimLundin/vaulter@main',
  shared: {
    '#kernel': kernel,
    zod,
    react,
    'react/jsx-runtime': jsxRuntime,
    'react-dom/client': reactDomClient,
  },
});
