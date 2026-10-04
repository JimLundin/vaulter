// Secrets: held by the kernel, never by an extension (ARCHITECTURE-pip.md, "Secrets"). Each is stored
// encrypted under a per-device key, under its extension's id, and attached by the kernel to requests for
// the hosts the extension declared for it. Nothing here syncs or reaches the repo.
import type { KernelApi, Statics } from './extension.ts';

/** Where the kernel keeps its own small state; IndexedDB in the browser (idb.ts), a Map in tests. */
export interface KernelKeep {
  get: <T>(id: string) => Promise<T | undefined>;
  set: (id: string, value: unknown) => Promise<void>;
  del: (id: string) => Promise<void>;
}

interface Sealed {
  iv: Uint8Array<ArrayBuffer>;
  data: ArrayBuffer;
}

const enc = new TextEncoder();

export interface SecretStore {
  set: (ext: string, name: string, value: string) => Promise<void>;
  has: (ext: string, name: string) => Promise<boolean>;
  forget: (ext: string, name: string) => Promise<void>;
  /** The kernel's only way to the value; never handed to an extension. */
  reveal: (ext: string, name: string) => Promise<string | undefined>;
}

export function secretStore(keep: KernelKeep): SecretStore {
  // A non-extractable AES-GCM key, created once per device; IndexedDB stores the CryptoKey itself.
  let key: Promise<CryptoKey> | undefined;
  const deviceKey = () => {
    key ??= (async () => {
      const k = await keep.get<CryptoKey>('device-key');
      if (k) return k;
      const fresh = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
        'encrypt',
        'decrypt',
      ]);
      await keep.set('device-key', fresh);
      return fresh;
    })();
    return key;
  };
  const id = (ext: string, name: string) => `secret:${ext}/${name}`;

  return {
    async set(ext, name, value) {
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const aad = enc.encode(id(ext, name));
      const data = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv, additionalData: aad },
        await deviceKey(),
        enc.encode(value),
      );
      await keep.set(id(ext, name), { iv, data } satisfies Sealed);
    },
    has: async (ext, name) => (await keep.get(id(ext, name))) !== undefined,
    forget: (ext, name) => keep.del(id(ext, name)),
    async reveal(ext, name) {
      const s = await keep.get<Sealed>(id(ext, name));
      if (!s) return;
      const plain = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: s.iv, additionalData: enc.encode(id(ext, name)) },
        await deviceKey(),
        s.data,
      );
      return new TextDecoder().decode(plain);
    },
  };
}

/** The kernel's `fetch` for one extension: https only, to its declared hosts, with a secret attached
 * only when the request names it and goes to one of that secret's hosts. */
export function kernelApi(
  ext: Pick<Statics, 'id' | 'permissions' | 'secrets'>,
  secrets: SecretStore,
  fetchImpl: typeof fetch = fetch,
): KernelApi {
  const allowed = new Set([
    ...ext.permissions.network,
    ...Object.values(ext.secrets).flatMap((s) => s.hosts),
  ]);
  return {
    async fetch(url, init = {}) {
      const u = new URL(url);
      if (u.protocol !== 'https:') throw new Error(`${ext.id}: only https requests (${u.origin})`);
      if (!allowed.has(u.hostname))
        throw new Error(`${ext.id}: ${u.hostname} is not among its declared hosts`);
      const { secret, ...rest } = init;
      const headers = new Headers(rest.headers);
      if (secret !== undefined) {
        const spec = ext.secrets[secret];
        if (!spec) throw new Error(`${ext.id}: no secret named "${secret}" is declared`);
        if (!spec.hosts.includes(u.hostname))
          throw new Error(`${ext.id}: the secret "${secret}" is not for ${u.hostname}`);
        const value = await secrets.reveal(ext.id, secret);
        if (value === undefined) throw new Error(`${ext.id}: the secret "${secret}" is not set`);
        headers.set(spec.header, spec.prefix + value);
      }
      // No credentials or referrer from the app's own origin ride along.
      return fetchImpl(u.href, {
        ...rest,
        headers,
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
      });
    },
    hasSecret: (name) => (name in ext.secrets ? secrets.has(ext.id, name) : Promise.resolve(false)),
  };
}
