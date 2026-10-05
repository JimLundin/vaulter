// Secrets: every one sealed into the page by CI (secrets.json, sealed.ts), opened on a device with the
// password once. The key derived from it is kept on the device, non-extractable, so a later deploy sealed
// with the same salt opens on its own; the secrets themselves are only ever in this page's memory. An
// extension asks for its own by name, and uses it as its service wants.
import { idbStore } from '#extensions/storage';
import { unlockDialog } from './dialog.ts';
import { isSealedFile, keyFor, open, type SealedFile } from './sealed.ts';

const store = idbStore('secrets');

interface Kept {
  salt: string;
  iterations: number;
  key: CryptoKey;
}

const read = async () => {
  const r = await fetch(new URL('secrets.json', location.href), {
    cache: 'no-cache',
  });
  const f: unknown = await r.json();
  return isSealedFile(f) ? f : null;
};
const file: SealedFile | null = await read().catch(() => null);
let opened: Record<string, string> = {};

if (file) {
  const kept = await store.get<Kept>('key');
  const same =
    kept?.salt === file.kdf.salt && kept.iterations === file.kdf.iterations;
  const values = same && (await open(kept.key, file).catch(() => null));
  if (values) {
    opened = values;
  } else if (typeof document !== 'undefined') {
    unlockDialog(unlock);
  }
}

/** Opens the page's sealed secrets with the password, and keeps the key on this device. */
export async function unlock(password: string) {
  if (!file) {
    throw new Error('this page has no sealed secrets');
  }
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

/** A secret by its name in the sealed file (`<extension>/<name>`: "openai/key"), once this device has
 * opened it. */
export const secret = (name: string): string | undefined => opened[name];
