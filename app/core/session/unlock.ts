// The password opens secrets.json, and this device remembers its non-extractable credential key
// for 30 days. Device credential overrides use that same key; vault contents remain plaintext.
import { deriveKey, unseal, type Sealed, type Secrets } from './sealed.ts';
import { database, done } from './idb.ts';
import { serial } from '@/shared/async/async.ts';

// Keep the existing key format: adding encrypted overrides does not discard remembered logins.
const db = database('vault', 5, { keys: 'id' });
const { get, put, del } = db;
/** For tests: forget the open connection. */
export const closeKeys = db.close;

export const REMEMBER_DAYS = 30;
const REMEMBER = REMEMBER_DAYS * 864e5;
const local = serial();
const coordinate = <Value>(operation: () => Promise<Value>): Promise<Value> =>
  local(() =>
    typeof navigator !== 'undefined' && navigator.locks
      ? navigator.locks.request('vaulter:credentials', operation)
      : operation(),
  );

export type SecretOverrides = Partial<Record<keyof Secrets, string | null>>;
export interface Credentials {
  readonly preloadedSecrets: Secrets;
  readonly secretOverrides: SecretOverrides;
  readonly secrets: Secrets;
}
interface EncryptedOverrides {
  iv: string;
  data: string;
}
interface Device {
  id: 'device';
  key: CryptoKey;
  salt: string;
  expires: number;
  overrides?: EncryptedOverrides;
}
const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const unb64 = (value: string) =>
  Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
const keys: readonly (keyof Secrets)[] = ['github', 'openai'];

function parseOverrides(value: unknown, reading = false): SecretOverrides {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid device credentials');
  const overrides: SecretOverrides = {};
  for (const [key, credential] of Object.entries(value)) {
    if (!keys.includes(key as keyof Secrets)) {
      if (reading) continue;
      throw new Error('Unknown credential');
    }
    if (credential === null && key !== 'github') overrides[key as keyof Secrets] = null;
    else if (typeof credential === 'string' && credential.trim())
      overrides[key as keyof Secrets] = credential.trim();
    else throw new Error('A GitHub token is required');
  }
  return overrides;
}

/** Missing overrides follow login defaults; null disables an optional credential. */
export function applySecretOverrides(preloaded: Secrets, overrides: SecretOverrides): Secrets {
  const secrets = { ...preloaded };
  for (const [key, value] of Object.entries(parseOverrides(overrides))) {
    if (value === null) delete secrets[key as keyof Secrets];
    else secrets[key as keyof Secrets] = value;
  }
  if (!secrets.github?.trim()) throw new Error('A GitHub token is required');
  return secrets;
}

async function readOverrides(device: Device): Promise<SecretOverrides> {
  if (!device.overrides) return {};
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: unb64(device.overrides.iv) },
    device.key,
    unb64(device.overrides.data),
  );
  return parseOverrides(JSON.parse(new TextDecoder().decode(plain)), true);
}

async function writeOverrides(device: Device, overrides: SecretOverrides): Promise<Device> {
  if (!Object.keys(overrides).length) {
    const { overrides: _removed, ...withoutOverrides } = device;
    return withoutOverrides;
  }
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    device.key,
    new TextEncoder().encode(JSON.stringify(overrides)),
  );
  return { ...device, overrides: { iv: b64(iv), data: b64(new Uint8Array(data)) } };
}

export async function forget() {
  await coordinate(() => del('keys', 'device'));
}

/** The preload and device choices, if the remembered key still opens this deployment. */
export function rememberedCredentials(
  sealed: Sealed,
  now = Date.now(),
): Promise<Credentials | null> {
  return coordinate(async () => {
    const device = await get<Device>('keys', 'device');
    if (!device) return null;
    if (device.expires > now && device.salt === sealed.kdf.salt) {
      try {
        const preloadedSecrets = await unseal(sealed, device.key);
        const secretOverrides = await readOverrides(device);
        return {
          preloadedSecrets,
          secretOverrides,
          secrets: applySecretOverrides(preloadedSecrets, secretOverrides),
        };
      } catch {
        // A rotated password or damaged credential record requires a fresh unlock.
      }
    }
    await del('keys', 'device');
    return null;
  });
}

/** Effective secrets for callers that do not need settings provenance. */
export async function remembered(sealed: Sealed, now = Date.now()): Promise<Secrets | null> {
  return (await rememberedCredentials(sealed, now))?.secrets ?? null;
}

/** Opens and remembers the deployment, retaining choices only from a still-valid login. */
export function unlockCredentials(
  sealed: Sealed,
  password: string,
  now = Date.now(),
): Promise<Credentials> {
  return coordinate(async () => {
    const key = await deriveKey(password, sealed.kdf.salt, sealed.kdf.iterations);
    const preloadedSecrets = await unseal(sealed, key);
    const previous = await get<Device>('keys', 'device');
    let secretOverrides: SecretOverrides = {};
    if (previous && previous.expires > now && previous.salt === sealed.kdf.salt) {
      try {
        await unseal(sealed, previous.key);
        secretOverrides = await readOverrides(previous);
      } catch {
        // The new password must not inherit overrides encrypted by the old one.
      }
    }
    const secrets = applySecretOverrides(preloadedSecrets, secretOverrides);
    await put(
      'keys',
      await writeOverrides(
        { id: 'device', key, salt: sealed.kdf.salt, expires: now + REMEMBER },
        secretOverrides,
      ),
    );
    await navigator.storage?.persist?.().catch(() => false);
    return { preloadedSecrets, secretOverrides, secrets };
  });
}

/** Opens the secrets with the password (throws if wrong) and remembers this device. */
export async function unlock(sealed: Sealed, password: string, now = Date.now()): Promise<Secrets> {
  return (await unlockCredentials(sealed, password, now)).secrets;
}

/** Persist encrypted choices before a session replaces its active credentials. */
export function saveSecretOverrides(
  sealed: Sealed,
  overrides: SecretOverrides,
  now = Date.now(),
  expected?: SecretOverrides,
): Promise<void> {
  return coordinate(async () => {
    const choices = parseOverrides(overrides);
    const device = await get<Device>('keys', 'device');
    if (!device || device.expires <= now || device.salt !== sealed.kdf.salt)
      throw new Error('Unlock the vault again to save credentials on this device.');
    const preloaded = await unseal(sealed, device.key);
    applySecretOverrides(preloaded, choices);
    if (expected) {
      const saved = await readOverrides(device);
      if (keys.some((key) => saved[key] !== expected[key]))
        throw new Error('Credentials changed in another tab. Reopen the vault before saving.');
    }
    const next = await writeOverrides(device, choices);
    await db.tx(['keys'], 'readwrite', async (transaction) => {
      const store = transaction.objectStore('keys');
      const current: Device | undefined = await done(store.get('device'));
      if (!current) throw new Error('Unlock the vault again to save credentials on this device.');
      if (
        current.salt !== device.salt ||
        current.expires !== device.expires ||
        current.overrides?.iv !== device.overrides?.iv ||
        current.overrides?.data !== device.overrides?.data
      )
        throw new Error('Credentials changed in another tab. Reopen the vault before saving.');
      await done(store.put(next));
    });
  });
}
