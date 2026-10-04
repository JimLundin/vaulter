// Starting the app in this browser: one tab at a time has the kernel, then it boots (boot.ts) on this
// browser as its device, and safe mode takes over when asked for (?safe), when no shell started, or
// when starting failed outright; it depends on no extension.
import { boot, type BootOptions, type Device } from './boot.ts';
import { presence } from './presence.ts';
import { safeMode } from './safe-mode.ts';
import { singleTab, standbyScreen } from './single-tab.ts';
import { idbKeep } from './storage.ts';
import { unlockScreen } from './unlock-screen.ts';

export type StartOptions = Pick<BootOptions, 'page' | 'defaultSource' | 'shared'>;

export async function start(opts: StartOptions) {
  // One tab at a time has the kernel; this one waits until the person moves Vaulter here.
  const tab = singleTab();
  if (!(await tab.claim())) {
    const moved = sessionStorage.getItem('vaulter-moved') === '1';
    sessionStorage.removeItem('vaulter-moved');
    await standbyScreen(tab, moved);
  }

  // Databases of earlier versions: the kernel's under its old name, and the one it shared with
  // extensions' storage (store-local keeps its own now).
  for (const old of ['pip-kernel', 'pip-data']) indexedDB.deleteDatabase(old);
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
        sessionStorage.setItem('vaulter-moved', '1');
        setTimeout(() => location.reload(), 50);
      });
    },
  };

  const booted = await boot(browser, {
    ...opts,
    safe: new URLSearchParams(location.search).has('safe'),
  });

  if (booted.safe) await safeMode(booted);
}
