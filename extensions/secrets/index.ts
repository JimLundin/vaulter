// Secrets: the network with secrets attached (#net). Each extension declares its secrets and the hosts
// each is for in its about.ts; this one keeps them encrypted on the device, opens the page's sealed ones
// (secrets.json, sealed by CI) with the password once, and attaches a secret only to a request for its
// hosts.
import type { NetV1 } from '#contracts/net';
import type { About } from '#kernel';
import { unlockDialog } from './dialog.ts';
import { idbStore } from './store.ts';
import { unsealer } from './unseal.ts';
import { fetcher, vault } from './vault.ts';

const store = idbStore();
const secrets = vault(store);
const sealed = unsealer(store, secrets);
const state = await sealed.check(async () =>
  (await fetch(new URL('secrets.json', location.href), { cache: 'no-cache' })).json(),
);
if (state === 'locked' && typeof document !== 'undefined') unlockDialog(sealed);

/** The network as `caller` has it, with what it declared in its about.ts. */
export const netFor = (caller: string, about: About): NetV1 => ({
  fetch: fetcher(caller, about, secrets),
  hasSecret: async (name) => name in (about.secrets ?? {}) && (await secrets.has(caller, name)),
  secrets: (of) =>
    Promise.all(of.map(async (s) => ({ ...s, set: await secrets.has(s.extension, s.name) }))),
  sealed: () => Promise.resolve({ present: sealed.present(), locked: sealed.locked() }),
  setSecret: (ext, name, value) => secrets.set(ext, name, value),
  forgetSecret: (ext, name) => secrets.forget(ext, name),
  unlock: (password) => sealed.unlock(password),
});

/** A removed extension's secrets go with it. */
export const forget = (caller: string) => secrets.forgetAll(caller);
