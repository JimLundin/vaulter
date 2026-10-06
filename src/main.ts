// The page's entry. Vaulter runs in one tab at a time, since two tabs would
// share one IndexedDB without hearing of each other's changes. So this tab
// first takes a Web Lock, held until it closes, and only then has the core
// start every extension: each starts as it is imported.

import { extensions } from '#core';

/** A line on the page, where there is nothing else to show. */
function say(text: string) {
    const line = document.createElement('p');
    line.style.cssText = 'font:15px/1.5 system-ui,sans-serif;margin:2rem';
    line.textContent = text;
    (document.getElementById('vaulter') ?? document.body).replaceChildren(line);
}

/** Whether this tab gets Vaulter: it does if no other tab has it. */
function claim() {
    return new Promise<boolean>((resolve) => {
        void navigator.locks.request(
            'vaulter',
            { ifAvailable: true },
            (lock) => {
                resolve(lock !== null);
                // Held until the tab closes.
                return lock ? new Promise<void>(() => undefined) : undefined;
            },
        );
    });
}

async function start() {
    if (!(await claim())) {
        say('Vaulter is open in another tab.');
        return;
    }
    try {
        await extensions();
        say('Vaulter is running. Its screens come with the shell.');
    } catch (error) {
        say(`Vaulter could not start: ${String(error)}`);
    }
}

void start();
