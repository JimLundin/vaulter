// Secrets: every one is sealed into the page by CI (secrets.json), and a
// device opens them with the password once. An extension asks for its own
// by name, and uses it as its service wants.

import { z } from 'zod';
import { type Extension, type Operation, operation } from '#core';
import { collection } from '#extensions/storage';
import { unlockDialog } from './dialog.ts';
import { keyFor, open, SealedFile } from './sealed.ts';

/** The key this device derived from the password. It can't be exported,
 * and opens every later deploy sealed with the same salt. */
const KeptKey = z.object({
    salt: z.string(),
    iterations: z.number(),
    key: z.instanceof(CryptoKey),
});

const keys = collection('secrets/key', KeptKey);

async function readSealedFile() {
    const url = new URL('secrets.json', location.href);
    const response = await fetch(url, { cache: 'no-cache' });
    // A build without a password has no secrets.json: the host answers with
    // a page, as the dev server does.
    if (!response.headers.get('Content-Type')?.includes('json')) {
        return null;
    }
    return SealedFile.parse(await response.json());
}

async function openWithKeptKey(file: SealedFile) {
    const kept = await keys.get({ id: 'key' });
    const fits =
        kept?.salt === file.kdf.salt && kept.iterations === file.kdf.iterations;
    if (!fits) {
        return null;
    }
    return open(kept.key, file);
}

const file = await readSealedFile();
// Only ever in this page's memory.
let opened: Record<string, string> = {};

if (file) {
    const values = await openWithKeptKey(file);
    if (values) {
        opened = values;
    } else if (typeof document !== 'undefined') {
        unlockDialog((password) => secrets.unlock({ password }));
    }
}

export const secrets = {
    unlock: operation({
        description:
            "Opens the page's sealed secrets with the password, and keeps " +
            'the key on this device.',
        input: z.object({ password: z.string().min(1) }),
        run: async ({ password }) => {
            if (!file) {
                throw new Error('this page has no sealed secrets');
            }
            const key = await keyFor(password, file.kdf);
            const values = await open(key, file);
            if (!values) {
                throw new Error('that password does not open the secrets');
            }
            opened = values;
            await keys.put({
                id: 'key',
                salt: file.kdf.salt,
                iterations: file.kdf.iterations,
                key,
            });
        },
    }),

    secret: operation({
        description:
            'A secret by its name in the sealed file, such as ' +
            '"openai/key", once this device has opened it.',
        input: z.object({ name: z.string() }),
        run: ({ name }): string | undefined => opened[name],
    }),
} satisfies Record<string, Operation>;

/** Secrets offers nothing: a secret given to the model would go out with
 * the model's requests, and a password typed to Vaulter with them too. The
 * unlock dialog is its own. */
export const extension = {} satisfies Extension;
