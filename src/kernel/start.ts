// Starting the app in this browser: one tab at a time has the kernel, then it boots (boot.ts) on this
// browser as its device, and safe mode takes over when asked for (?safe), when no shell started, or
// when starting failed outright; it depends on no extension.
import type { SourceV1 } from '@contracts/extensions.source';
import { boot, type Device } from './boot.ts';
import { presence } from './presence.ts';
import { safeMode } from './safe-mode.ts';
import { singleTab, standbyScreen } from './single-tab.ts';
import { idbKeep } from './storage.ts';
import { unlockScreen } from './unlock-screen.ts';

export interface StartOptions {
  /** The bundled extensions' source, with the contracts they import: path → text. */
  bundledSource: Record<string, string>;
  bundled: string[];
  /** `owner/repo@ref` unless this device chose otherwise. */
  defaultSource: string;
  /** The modules extensions import by name, as the kernel bundle has them. */
  shared: Record<string, object>;
  /** Under `npm run dev`: the working tree instead of a repo. */
  devSource?: SourceV1;
}

export async function start(opts: StartOptions) {
  // One tab at a time has the kernel; this one waits until the person moves Vaulter here.
  const tab = singleTab();
  if (!(await tab.claim())) {
    const moved = sessionStorage.getItem('pip-moved') === '1';
    sessionStorage.removeItem('pip-moved');
    await standbyScreen(tab, moved);
  }

  // The database the kernel shared with extensions' storage; store-local keeps its own now.
  indexedDB.deleteDatabase('pip-data');
  const browser: Device = {
    keep: idbKeep(),
    url: (code) => URL.createObjectURL(new Blob([code], { type: 'text/javascript' })),
    load: (url) => import(/* @vite-ignore */ url),
    presence: presence(() => navigator.userActivation?.isActive === true),
    sealedFile: async () =>
      (await fetch(new URL('secrets.json', location.href), { cache: 'no-cache' })).json(),
    askPassword: unlockScreen,
    restart: () => location.reload(),
    watch: (kernel) => {
      // An error nothing caught is kept under the extension whose code threw it (its stack says).
      addEventListener('error', (e) => kernel.errors.uncaught(e.error));
      addEventListener('unhandledrejection', (e) => kernel.errors.uncaught(e.reason));
      // Another tab asked for Vaulter: every handle refuses, the lock goes over, and this tab reloads
      // into the waiting screen.
      tab.onTakeOver(async () => {
        kernel.dispose();
        sessionStorage.setItem('pip-moved', '1');
        setTimeout(() => location.reload(), 50);
      });
    },
  };

  const booted = await boot(browser, {
    source: opts.devSource
      ? { provide: opts.devSource }
      : { bundled: opts.bundledSource, ids: opts.bundled },
    defaultSource: opts.defaultSource,
    shared: opts.shared,
    safe: new URLSearchParams(location.search).has('safe'),
  });
  if (booted.safe) await safeMode(booted);
}
