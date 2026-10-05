// Starting the app in this browser: only one tab may have it, and that tab imports the extensions this
// device has on (kernel.ts) and hands the page to the shell. ?reset forgets this device's choices
// of what is on, for a device a preview has left without a working screen.
import { uncaught } from './errors.ts';
import { boot, type Folders, running, type Settings } from './kernel.ts';
import { claim } from './single-tab.ts';

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

  if (!(await claim())) return say('Vaulter is open in another tab.');
  // An error nothing caught is kept under the extension whose code threw it (its stack says).
  addEventListener('error', (e) => uncaught(e.error));
  addEventListener('unhandledrejection', (e) => uncaught(e.reason));

  await boot(folders, { settings, reload: () => location.reload() });
  const shell = running().find((r) => r.exports.shell)?.exports.shell as
    | { mount: (at: HTMLElement) => void }
    | undefined;
  if (shell) shell.mount(root());
  else say('No shell is installed.');
}

const root = () => document.getElementById('vaulter') ?? document.body;

/** A line on the page, where there is nothing else to show. */
function say(text: string) {
  const p = document.createElement('p');
  p.style.cssText = 'font:15px/1.5 system-ui,sans-serif;margin:2rem';
  p.textContent = text;
  root().replaceChildren(p);
}
