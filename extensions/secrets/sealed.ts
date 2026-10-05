// Sealed secrets: every secret in one file, encrypted with a key derived from a password (PBKDF2,
// AES-GCM), so it can sit in the public page (dist/secrets.json). CI seals it from the repo's secrets
// (tools/seal-secrets.ts); the secrets extension opens it with the password once per device and keeps
// the secrets in its vault (vault.ts). Keys inside are `<extension>/<name>`: "openai/key".
// Pure WebCrypto, for the browser and for Node.

export interface SealedFile {
  v: 1;
  kdf: { name: 'PBKDF2'; hash: 'SHA-256'; iterations: number; salt: string };
  iv: string;
  data: string;
}

const AAD = new TextEncoder().encode('vaulter-secrets-v1');
const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

/** The key for a file's salt and iterations; non-extractable, so a device can keep it. */
export async function keyFor(password: string, kdf: SealedFile['kdf']): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', iterations: kdf.iterations, salt: unb64(kdf.salt) },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function seal(
  password: string,
  secrets: Record<string, string>,
  opts: { salt?: Uint8Array; iterations?: number } = {},
): Promise<SealedFile> {
  const kdf = {
    name: 'PBKDF2' as const,
    hash: 'SHA-256' as const,
    iterations: opts.iterations ?? 600_000,
    salt: b64(opts.salt ?? crypto.getRandomValues(new Uint8Array(16))),
  };
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: AAD },
    await keyFor(password, kdf),
    new TextEncoder().encode(JSON.stringify(secrets)),
  );
  return { v: 1, kdf, iv: b64(iv), data: b64(new Uint8Array(data)) };
}

/** The secrets in a file; throws on the wrong key. */
export async function open(key: CryptoKey, file: SealedFile): Promise<Record<string, string>> {
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: unb64(file.iv), additionalData: AAD },
    key,
    unb64(file.data),
  );
  return JSON.parse(new TextDecoder().decode(plain)) as Record<string, string>;
}

export const isSealedFile = (v: unknown): v is SealedFile =>
  typeof v === 'object' &&
  v !== null &&
  (v as SealedFile).v === 1 &&
  typeof (v as SealedFile).data === 'string' &&
  typeof (v as Partial<SealedFile>).kdf?.salt === 'string';
