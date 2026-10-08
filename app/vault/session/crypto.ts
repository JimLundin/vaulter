// Encryption at rest, with a cache key: AES-GCM, the key made on this device and never extractable
// (unlock.ts keeps it). Whatever a backend keeps on the device is encrypted with it.

export interface Encrypted {
  iv: Uint8Array<ArrayBuffer>;
  data: ArrayBuffer;
}

export const newCacheKey = () =>
  crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);

/** `aad` binds the ciphertext to where it is stored (a blob's sha, "snapshot"), so a record moved elsewhere fails to open. */
export async function encrypt(
  key: CryptoKey,
  bytes: Uint8Array<ArrayBuffer>,
  aad: string,
): Promise<Encrypted> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  return {
    iv,
    data: await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(aad) },
      key,
      bytes,
    ),
  };
}

export async function decrypt(
  key: CryptoKey,
  e: Encrypted,
  aad: string,
): Promise<Uint8Array<ArrayBuffer>> {
  return new Uint8Array(
    await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: e.iv, additionalData: new TextEncoder().encode(aad) },
      key,
      e.data,
    ),
  );
}

export const encryptJson = (key: CryptoKey, v: unknown, aad: string) =>
  encrypt(key, new TextEncoder().encode(JSON.stringify(v)), aad);
export const decryptJson = async <T>(key: CryptoKey, e: Encrypted, aad: string): Promise<T> =>
  JSON.parse(new TextDecoder().decode(await decrypt(key, e, aad)));
