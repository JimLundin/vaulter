// Starting the app in this browser: one tab at a time has the kernel, then it imports the extensions
// this device has on (kernel.ts) and hands the page to the shell. ?reset forgets this device's choices
// of what is on, for a device a preview has left without a working screen.
import { h, root } from './dom.ts';
import { uncaught } from './errors.ts';
import { boot, type Folders, running, type Settings } from './kernel.ts';
import { singleTab, standbyScreen } from './single-tab.ts';

const KEY = 'vaulter';

const settings = {
  get: (): Settings => ({ enabled: {}, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') }),
  set: (s: Settings) => localStorage.setItem(KEY, JSON.stringify(s)),
};

export async function start(folders: Folders) {
  if (new URLSearchParams(location.search).has('reset')) {
    localStorage.removeItem(KEY);
    location.replace(location.pathname);
    return;
  }

  // One tab at a time has the kernel; this one waits until the person moves Vaulter here.
  const tab = singleTab();
  if (!(await tab.claim())) {
    const moved = sessionStorage.getItem('vaulter-moved') === '1';
    sessionStorage.removeItem('vaulter-moved');
    await standbyScreen(tab, moved);
  }
  // Another tab asked for Vaulter: the lock goes over, and this tab reloads into the waiting screen.
  tab.onTakeOver(() => {
    sessionStorage.setItem('vaulter-moved', '1');
    setTimeout(() => location.reload(), 50);
  });
  // An error nothing caught is kept under the extension whose code threw it (its stack says).
  addEventListener('error', (e) => uncaught(e.error));
  addEventListener('unhandledrejection', (e) => uncaught(e.reason));

  await boot(folders, { settings, reload: () => location.reload() });
  const shell = running().find((r) => r.exports.shell)?.exports.shell as
    | { mount: (at: HTMLElement) => void }
    | undefined;
  if (shell) shell.mount(root());
  else
    root().replaceChildren(
      h('p', { style: 'font:15px/1.5 system-ui,sans-serif;margin:2rem' }, 'No shell is installed.'),
    );
}
