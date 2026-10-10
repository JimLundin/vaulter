// The app's secrets (GitHub token, OpenAI key), sealed with a password: PBKDF2-SHA256 → AES-GCM-256.
// WebCrypto only, so the same code seals in Node (tools/seal-secrets.ts, in CI) and opens in the browser.
// The sealed file is public; its safety is the password's strength and the iteration count. The salt is
// fixed across publishes, so a device's remembered key keeps opening new seals; a new salt (or password)
// signs every device out.

export interface Secrets {
  github: string;
  openai?: string;
  /** Jina (jina.ai), for the agent's web search. */
  jina?: string;
}

export interface Sealed {
  v: 1;
  kdf: { name: 'PBKDF2'; hash: 'SHA-256'; iterations: number; salt: string };
  iv: string;
  data: string;
}

const ITERATIONS = 600_000;

const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const text = new TextEncoder();

/** The AES key for a password and salt. Non-extractable: it can be used and stored, never read out. */
export async function deriveKey(
  password: string,
  salt: string,
  iterations = ITERATIONS,
): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', text.encode(password), 'PBKDF2', false, [
    'deriveKey',
  ]);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: unb64(salt), iterations },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/** A new random salt, base64. */
const newSalt = () => b64(crypto.getRandomValues(new Uint8Array(16)));

export async function seal(
  secrets: Secrets,
  password: string,
  salt = newSalt(),
  iterations = ITERATIONS,
): Promise<Sealed> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt, iterations);
  const data = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, text.encode(JSON.stringify(secrets))),
  );
  return {
    v: 1,
    kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations, salt },
    iv: b64(iv),
    data: b64(data),
  };
}

/** The secrets, or a thrown error if the key is wrong (AES-GCM authenticates). */
export async function unseal(sealed: Sealed, key: CryptoKey): Promise<Secrets> {
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: unb64(sealed.iv) },
    key,
    unb64(sealed.data),
  );
  return JSON.parse(new TextDecoder().decode(plain));
}
