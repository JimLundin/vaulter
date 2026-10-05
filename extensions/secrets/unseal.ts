// Bringing the sealed file's secrets onto this device: once with the password, and after that on its
// own for every new file sealed with the same salt (the derived key is kept, non-extractable). The
// secrets go into the vault; nothing else ever sees them.
import { isSealedFile, keyFor, open, type SealedFile } from './sealed.ts';
import type { Store } from './store.ts';
import type { Vault } from './vault.ts';

export type SealedState = 'none' | 'imported' | 'locked';

const digest = async (file: SealedFile) =>
  [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(file.data)))]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

export function unsealer(keep: Store, secrets: Vault) {
  let file: SealedFile | null = null;
  let locked = false;

  const importAll = async (values: Record<string, string>) => {
    for (const [k, v] of Object.entries(values)) {
      const [ext, name] = k.split('/');
      if (ext && name && v) await secrets.set(ext, name, v);
    }
  };

  return {
    /** Reads the page's sealed file (secrets.json), and imports it if this device can already. */
    async check(fetchFile: () => Promise<unknown>): Promise<SealedState> {
      const raw = await fetchFile().catch(() => null);
      file = isSealedFile(raw) ? raw : null;
      if (!file) return 'none';
      const d = await digest(file);
      if ((await keep.get<string>('sealed:imported')) === d) return 'imported';
      const kept = await keep.get<{ salt: string; iterations: number; key: CryptoKey }>(
        'sealed:key',
      );
      if (kept?.salt === file.kdf.salt && kept.iterations === file.kdf.iterations) {
        try {
          await importAll(await open(kept.key, file));
          await keep.set('sealed:imported', d);
          return 'imported';
        } catch {
          // A different password with the same salt: ask.
        }
      }
      locked = true;
      return 'locked';
    },

    /** Opens the file with the password and imports it; throws on the wrong one. */
    async unlock(password: string) {
      if (!file) throw new Error('there is no sealed file');
      const key = await keyFor(password, file.kdf);
      let values: Record<string, string>;
      try {
        values = await open(key, file);
      } catch (cause) {
        throw new Error('that password does not open the secrets', { cause });
      }
      await importAll(values);
      await keep.set('sealed:key', { salt: file.kdf.salt, iterations: file.kdf.iterations, key });
      await keep.set('sealed:imported', await digest(file));
      locked = false;
    },

    present: () => file !== null,
    /** The page has sealed secrets this device hasn't opened. */
    locked: () => locked,
  };
}

export type Unsealer = ReturnType<typeof unsealer>;
