// Starting the app in this browser: claim the tab, import every extension,
// and hand the page to the shell.

import { messageOf } from './api.ts';
import { load } from './kernel.ts';
import { claim } from './single-tab.ts';

type Module = Record<string, unknown>;

interface Shell {
    mount: (root: HTMLElement) => void;
}

function root() {
    return document.getElementById('vaulter') ?? document.body;
}

/** A line on the page, where there is nothing else to show. */
function say(text: string) {
    const line = document.createElement('p');
    line.style.cssText = 'font:15px/1.5 system-ui,sans-serif;margin:2rem';
    line.textContent = text;
    root().replaceChildren(line);
}

async function importAll(folders: Record<string, () => Promise<Module>>) {
    const entries = await Promise.all(
        Object.entries(folders).map(
            async ([id, importModule]) => [id, await importModule()] as const,
        ),
    );
    return Object.fromEntries(entries);
}

/** Starts Vaulter in this tab, from every extension's import. */
export async function start(folders: Record<string, () => Promise<Module>>) {
    if (!(await claim())) {
        say('Vaulter is open in another tab.');
        return;
    }

    let modules: Record<string, Module>;
    try {
        modules = await importAll(folders);
    } catch (error) {
        say(`Vaulter could not start: ${messageOf(error)}`);
        return;
    }
    load(modules);

    const shell = Object.values(modules).find((m) => m.shell)?.shell as
        | Shell
        | undefined;
    if (shell) {
        shell.mount(root());
    } else {
        say('No shell is installed.');
    }
}
