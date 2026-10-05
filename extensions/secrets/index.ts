// Secrets: every one is sealed into the page by CI (secrets.json), and a
// device opens them with the password once. An extension asks for its own
// by name, and uses it as its service wants.

import { idbStore } from '#extensions/storage';
import { unlockDialog } from './dialog.ts';
import { keyFor, open, SealedFile } from './sealed.ts';

/** The key this device derived from the password. It can't be exported,
 * and opens every later deploy sealed with the same salt. */
interface KeptKey {
    salt: string;
    iterations: number;
    key: CryptoKey;
}

const store = idbStore('secrets');

async function readSealedFile() {
    const url = new URL('secrets.json', location.href);
    const response = await fetch(url, { cache: 'no-cache' });
    return SealedFile.parse(await response.json());
}

async function openWithKeptKey(file: SealedFile) {
    const kept = await store.get<KeptKey>('key');
    const fits =
        kept?.salt === file.kdf.salt && kept.iterations === file.kdf.iterations;
    if (!fits) {
        return null;
    }
    return await open(kept.key, file).catch(() => null);
}

const file = await readSealedFile().catch(() => null);
// Only ever in this page's memory.
let opened: Record<string, string> = {};

if (file) {
    const values = await openWithKeptKey(file);
    if (values) {
        opened = values;
    } else if (typeof document !== 'undefined') {
        unlockDialog(unlock);
    }
}

/** Opens the page's sealed secrets with the password, and keeps the key on
 * this device. */
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
    const kept: KeptKey = {
        salt: file.kdf.salt,
        iterations: file.kdf.iterations,
        key,
    };
    await store.set('key', kept);
}

/** A secret by its name in the sealed file, such as "openai/key", once
 * this device has opened it. */
export function secret(name: string): string | undefined {
    return opened[name];
}
