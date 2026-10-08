// Unlocking: the password opens secrets.json (app/core/sealed.ts), and this device remembers the derived
// key for 30 days, as a non-extractable CryptoKey in IndexedDB, with a fresh cache key for the notes.
// Re-sealing (a new salt), expiry or signing out forgets both, which leaves the cached notes unreadable,
// so they are cleared too.
import { deriveKey, unseal, type Sealed, type Secrets } from './sealed.ts';
import { newCacheKey } from './crypto.ts';
import { database } from './idb.ts';

//   keys  'device' -> { id, key, salt, cacheKey, expires }   what unlocking remembers
//         'dev' -> { id, cacheKey }                         dev's cache key (no password)
// The database was the whole cache once (version 3); the upgrade keeps only the keys.
const db = database('vault', 4, { keys: 'id' }, ['keys']);
const { get, put, del } = db;
/** For tests: forget the open connection. */
export const closeKeys = db.close;

const REMEMBER = 30 * 864e5;

interface Device {
  id: 'device';
  key: CryptoKey;
  salt: string;
  cacheKey: CryptoKey;
  expires: number;
}
export interface Unlocked {
  secrets: Secrets;
  cacheKey: CryptoKey;
}

export async function forget() {
  await del('keys', 'device');
}

/** The secrets, if this device remembers a key that still opens them; otherwise null (and forgotten). */
export async function remembered(sealed: Sealed, now = Date.now()): Promise<Unlocked | null> {
  const d = await get<Device>('keys', 'device');
  if (!d) return null;
  if (d.expires > now && d.salt === sealed.kdf.salt) {
    try {
      return { secrets: await unseal(sealed, d.key), cacheKey: d.cacheKey };
    } catch {
      // It no longer opens them (a new password): forgotten below.
    }
  }
  await forget();
  return null;
}

/** Dev: the secrets from the environment (vite.config.ts), no password; this device keeps one cache key, so
 * the cache outlives a reload. */
export async function devUnlocked(secrets: Secrets): Promise<Unlocked> {
  const kept = await get<{ id: 'dev'; cacheKey: CryptoKey }>('keys', 'dev');
  if (kept) return { secrets, cacheKey: kept.cacheKey };
  const cacheKey = await newCacheKey();
  await put('keys', { id: 'dev', cacheKey });
  return { secrets, cacheKey };
}

/** Opens the secrets with the password (throws if it's wrong) and remembers this device. */
export async function unlock(
  sealed: Sealed,
  password: string,
  now = Date.now(),
): Promise<Unlocked> {
  const key = await deriveKey(password, sealed.kdf.salt, sealed.kdf.iterations);
  const secrets = await unseal(sealed, key);
  await forget(); // a new cache key: what was cached under the old one can't be read, and is cleared
  const cacheKey = await newCacheKey();
  await put('keys', {
    id: 'device',
    key,
    salt: sealed.kdf.salt,
    cacheKey,
    expires: now + REMEMBER,
  } satisfies Device);
  await navigator.storage?.persist?.().catch(() => false);
  return { secrets, cacheKey };
}
