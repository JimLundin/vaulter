// What the kernel sends every sandbox, as one bundle: the runtime, the kernel's API for extensions, and
// Zod. The bootstrap (boot.js) imports it and calls `start` with the kernel's port.
import * as zod from 'zod';
import * as api from '../kernel/api.ts';
import type { Port } from '../kernel/wire.ts';
import { runtime } from './runtime.ts';

interface Ui {
  react: object;
  jsxRuntime: object;
  reactDomClient: object;
}

export function start(port: Port, mods: { ui?: Ui }) {
  const ui = (pick: (u: Ui) => object) => () => {
    if (!mods.ui) return Promise.reject(new Error('this sandbox was started without React'));
    return Promise.resolve(pick(mods.ui));
  };
  runtime(port, {
    url: (code) => URL.createObjectURL(new Blob([code], { type: 'text/javascript' })),
    load: (url) => import(/* @vite-ignore */ url),
    shared: {
      '@pip/kernel': () => Promise.resolve(api),
      zod: () => Promise.resolve(zod),
      react: ui((u) => u.react),
      'react/jsx-runtime': ui((u) => u.jsxRuntime),
      'react-dom/client': ui((u) => u.reactDomClient),
    },
  });
}
