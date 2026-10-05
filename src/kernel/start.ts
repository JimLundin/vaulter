// Starting the app in this browser: only one tab may have it, and that tab imports every extension
// (kernel.ts) and hands the page to the shell.
import { load } from './kernel.ts';
import { claim } from './single-tab.ts';

export async function start(
  folders: Record<string, () => Promise<Record<string, unknown>>>,
) {
  if (!(await claim())) {
    return say('Vaulter is open in another tab.');
  }
  const modules = await Promise.all(
    Object.entries(folders).map(
      async ([id, importIt]) => [id, await importIt()] as const,
    ),
  ).catch((e: Error) => say(`Vaulter could not start: ${e.message}`));
  if (!modules) {
    return;
  }
  load(Object.fromEntries(modules));
  const shell = modules.find(([, m]) => m.shell)?.[1].shell as
    | { mount: (at: HTMLElement) => void }
    | undefined;
  if (shell) {
    shell.mount(root());
  } else {
    say('No shell is installed.');
  }
}

const root = () => document.getElementById('vaulter') ?? document.body;

/** A line on the page, where there is nothing else to show. */
function say(text: string) {
  const p = document.createElement('p');
  p.style.cssText = 'font:15px/1.5 system-ui,sans-serif;margin:2rem';
  p.textContent = text;
  root().replaceChildren(p);
}
