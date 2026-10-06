// The page's entry. Vaulter runs in one tab at a time, so this tab claims it
// first, and only then imports the agent. The agent imports the extensions
// it uses, and they import theirs: each starts as it is imported.

import { messageOf } from './kernel/api.ts';
import { claim } from './kernel/single-tab.ts';

/** A line on the page, where there is nothing else to show. */
function say(text: string) {
    const line = document.createElement('p');
    line.style.cssText = 'font:15px/1.5 system-ui,sans-serif;margin:2rem';
    line.textContent = text;
    (document.getElementById('vaulter') ?? document.body).replaceChildren(line);
}

if (await claim()) {
    try {
        await import('#extensions/agent');
        say('Vaulter is running. Its screens come with the shell.');
    } catch (error) {
        say(`Vaulter could not start: ${messageOf(error)}`);
    }
} else {
    say('Vaulter is open in another tab.');
}
