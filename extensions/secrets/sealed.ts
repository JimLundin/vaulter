// Sealed secrets: every secret in one file, encrypted with a key derived
// from a password (PBKDF2, AES-GCM), so it can be public. CI seals it, and
// a device opens it. Plain WebCrypto, for the browser and for Node.

export interface SealedFile {
    v: 1;
    kdf: { name: 'PBKDF2'; hash: 'SHA-256'; iterations: number; salt: string };
    iv: string;
    data: string;
}

const AAD = new TextEncoder().encode('vaulter-secrets-v1');
function base64(bytes: Uint8Array) {
    return btoa(String.fromCharCode(...bytes));
}

function bytesOf(base64Text: string) {
    return Uint8Array.from(atob(base64Text), (c) => c.charCodeAt(0));
}

/** The key for a file's salt and iterations. It can't be exported, so a
 * device can keep it. */
export async function keyFor(
    password: string,
    kdf: SealedFile['kdf'],
): Promise<CryptoKey> {
    const base = await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(password),
        'PBKDF2',
        false,
        ['deriveKey'],
    );
    return crypto.subtle.deriveKey(
        {
            name: 'PBKDF2',
            hash: 'SHA-256',
            iterations: kdf.iterations,
            salt: bytesOf(kdf.salt),
        },
        base,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt'],
    );
}

/** `secrets` sealed with `password`. Keep `salt` the same across deploys,
 * and a device that opened one opens the next on its own. */
export async function seal(
    password: string,
    secrets: Record<string, string>,
    opts: { salt?: Uint8Array; iterations?: number } = {},
): Promise<SealedFile> {
    const kdf = {
        name: 'PBKDF2' as const,
        hash: 'SHA-256' as const,
        iterations: opts.iterations ?? 600_000,
        salt: base64(opts.salt ?? crypto.getRandomValues(new Uint8Array(16))),
    };
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const data = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv, additionalData: AAD },
        await keyFor(password, kdf),
        new TextEncoder().encode(JSON.stringify(secrets)),
    );
    return { v: 1, kdf, iv: base64(iv), data: base64(new Uint8Array(data)) };
}

/** The secrets in a file. Throws on the wrong key. */
export async function open(
    key: CryptoKey,
    file: SealedFile,
): Promise<Record<string, string>> {
    const plain = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: bytesOf(file.iv), additionalData: AAD },
        key,
        bytesOf(file.data),
    );
    return JSON.parse(new TextDecoder().decode(plain)) as Record<
        string,
        string
    >;
}

/** Whether `value` is a sealed file, as the page serves it. */
export function isSealedFile(value: unknown): value is SealedFile {
    const file = value as Partial<SealedFile> | null;
    return (
        typeof file === 'object' &&
        file !== null &&
        file.v === 1 &&
        typeof file.data === 'string' &&
        typeof file.kdf?.salt === 'string'
    );
}
