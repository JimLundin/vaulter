// Unlocking: the password opens secrets.json (app/vault/session/sealed.ts), and this device remembers the derived
// key for 30 days, as a non-extractable CryptoKey in IndexedDB. Vault contents are stored in
// plaintext. Signing out clears the device contents.
import { deriveKey, unseal, type Sealed, type Secrets } from './sealed.ts';
import { database } from './idb.ts';

// The device remembers only the password-derived credential key. Version 5 drops old cache keys.
const db = database('vault', 5, { keys: 'id' });
const { get, put, del } = db;
/** For tests: forget the open connection. */
export const closeKeys = db.close;

const REMEMBER = 30 * 864e5;

interface Device {
  id: 'device';
  key: CryptoKey;
  salt: string;
  expires: number;
}
export async function forget() {
  await del('keys', 'device');
}

/** The secrets, if this device remembers a key that still opens them; otherwise null (and forgotten). */
export async function remembered(sealed: Sealed, now = Date.now()): Promise<Secrets | null> {
  const d = await get<Device>('keys', 'device');
  if (!d) return null;
  if (d.expires > now && d.salt === sealed.kdf.salt) {
    try {
      return await unseal(sealed, d.key);
    } catch {
      // It no longer opens them (a new password): forgotten below.
    }
  }
  await forget();
  return null;
}

/** Opens the secrets with the password (throws if it's wrong) and remembers this device. */
export async function unlock(sealed: Sealed, password: string, now = Date.now()): Promise<Secrets> {
  const key = await deriveKey(password, sealed.kdf.salt, sealed.kdf.iterations);
  const secrets = await unseal(sealed, key);
  await forget(); // forget the previous remembered unlock
  await put('keys', {
    id: 'device',
    key,
    salt: sealed.kdf.salt,
    expires: now + REMEMBER,
  } satisfies Device);
  await navigator.storage?.persist?.().catch(() => false);
  return secrets;
}
