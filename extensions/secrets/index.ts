// Secrets (net@1): the network with secrets attached. Each extension declares its secrets and the hosts
// each is for; this one keeps them encrypted on the device, opens the page's sealed ones (secrets.json,
// sealed by CI) with the password once, and attaches a secret only to a request for its hosts. Remove it
// and what needs a key stops working; the app still runs.
import { net } from '@contracts/net';
import { defineExtension, perCaller } from '@vaulter/kernel';
import { unlockDialog } from './dialog.ts';
import { idbStore } from './store.ts';
import { unsealer } from './unseal.ts';
import { fetcher, vault } from './vault.ts';

export default defineExtension({
  id: 'secrets',
  version: '1.0.0',
  provides: { net },
  agentGuide: 'Holds secrets and attaches them to requests. Vaulter never needs to call this.',
  async setup() {
    const store = idbStore();
    const secrets = vault(store);
    const sealed = unsealer(store, secrets);
    const state = await sealed.check(async () =>
      (await fetch(new URL('secrets.json', location.href), { cache: 'no-cache' })).json(),
    );
    if (state === 'locked' && typeof document !== 'undefined') unlockDialog(sealed);

    return {
      net: perCaller(
        (caller, statics) => ({
          fetch: fetcher(statics, secrets),
          hasSecret: async (name: string) =>
            name in statics.secrets && (await secrets.has(caller, name)),
          secrets: (of: { ext: string; name: string }[]) =>
            Promise.all(of.map(async (s) => ({ ...s, set: await secrets.has(s.ext, s.name) }))),
          sealed: async () => ({ present: sealed.present(), locked: sealed.locked() }),
          setSecret: (ext: string, name: string, value: string) => secrets.set(ext, name, value),
          forgetSecret: (ext: string, name: string) => secrets.forget(ext, name),
          unlock: (password: string) => sealed.unlock(password),
        }),
        // A removed extension's secrets go with it.
        { forget: (caller) => secrets.forgetAll(caller) },
      ),
    };
  },
});
