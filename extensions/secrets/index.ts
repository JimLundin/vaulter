// Secrets: every one sealed into the page by CI (secrets.json, sealed.ts), opened on a device with the
// password once. The key derived from it is kept on the device, non-extractable, so a later deploy sealed
// with the same salt opens on its own; the secrets themselves are only ever in this page's memory.
// A secret is attached only to a request for the hosts its extension declared for it.
import { idbStore } from '#extensions/storage';
import type { FetchInit, Net } from './api.ts';
import { unlockDialog } from './dialog.ts';
import { isSealedFile, keyFor, open, type SealedFile } from './sealed.ts';

export * from './api.ts';

const store = idbStore('secrets');

interface Kept {
  salt: string;
  iterations: number;
  key: CryptoKey;
}

const read = async () => {
  const r = await fetch(new URL('secrets.json', location.href), { cache: 'no-cache' });
  const f: unknown = await r.json();
  return isSealedFile(f) ? f : null;
};
const file: SealedFile | null = await read().catch(() => null);
let opened: Record<string, string> = {};

if (file) {
  const kept = await store.get<Kept>('key');
  const same = kept?.salt === file.kdf.salt && kept.iterations === file.kdf.iterations;
  const values = same && (await open(kept.key, file).catch(() => null));
  if (values) opened = values;
  else if (typeof document !== 'undefined') unlockDialog(unlock);
}

/** Opens the page's sealed secrets with the password, and keeps the key on this device. */
export async function unlock(password: string) {
  if (!file) throw new Error('this page has no sealed secrets');
  const key = await keyFor(password, file.kdf);
  try {
    opened = await open(key, file);
  } catch (cause) {
    throw new Error('that password does not open the secrets', { cause });
  }
  await store.set('key', {
    salt: file.kdf.salt,
    iterations: file.kdf.iterations,
    key,
  } satisfies Kept);
}

/** The network as `caller` has it: `secrets` are its secrets' names, each with the only hosts it is
 * attached for. */
export const netFor = (caller: string, secrets: Record<string, string[]>): Net => ({
  async fetch(url: string, init: FetchInit = {}) {
    const u = new URL(url);
    if (u.protocol !== 'https:') throw new Error(`${caller}: only https requests (${u.origin})`);
    const { secret, ...rest } = init;
    const headers = new Headers(rest.headers);
    if (secret !== undefined) {
      const hosts = secrets[secret];
      if (!hosts) throw new Error(`${caller}: no secret named "${secret}" is declared`);
      if (!hosts.includes(u.hostname))
        throw new Error(`${caller}: the secret "${secret}" is not for ${u.hostname}`);
      const value = opened[`${caller}/${secret}`];
      if (value === undefined) throw new Error(`${caller}: the secret "${secret}" is not set`);
      headers.set('Authorization', `Bearer ${value}`);
    }
    // No credentials or referrer from the app's own origin ride along, and no redirect elsewhere.
    return await fetch(u.href, {
      method: rest.method,
      body: rest.body as BodyInit | undefined,
      headers,
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      redirect: 'error',
    });
  },
});
