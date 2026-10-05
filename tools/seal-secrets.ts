// Seals the secrets into the built page, in CI (deploy.yml):
//   node tools/seal-secrets.ts dist/secrets.json
//
// From the repo's settings: VAULTER_PASSWORD, and one secret per value,
// named VAULTER_SECRET__<EXTENSION>__<NAME> (VAULTER_SECRET__OPENAI__KEY is
// openai/key). VAULTER_SALT, 16 bytes in base64 and set once, keeps the
// salt the same across deploys, so devices open each new file on their own.

import { writeFile } from 'node:fs/promises';
import { seal } from '../extensions/secrets/sealed.ts';

const SECRET = /^VAULTER_SECRET__([A-Z0-9_]+?)__([A-Z0-9_]+)$/;

/** Every VAULTER_SECRET__ variable, by its name in the sealed file. */
function secretsIn(env: NodeJS.ProcessEnv) {
    const secrets: Record<string, string> = {};
    for (const [variable, value] of Object.entries(env)) {
        const match = SECRET.exec(variable);
        if (!match || !value) {
            continue;
        }
        const extension = match[1].toLowerCase().replaceAll('_', '-');
        const name = match[2].toLowerCase().replaceAll('_', '.');
        secrets[`${extension}/${name}`] = value;
    }
    return secrets;
}

function saltIn(env: NodeJS.ProcessEnv) {
    if (!env.VAULTER_SALT) {
        return undefined;
    }
    const salt = Uint8Array.from(atob(env.VAULTER_SALT), (c) =>
        c.charCodeAt(0),
    );
    if (salt.length < 16) {
        throw new Error('VAULTER_SALT must be 16 bytes, base64');
    }
    return salt;
}

const [, , out] = process.argv;
if (!out) {
    throw new Error('usage: node tools/seal-secrets.ts <out.json>');
}

const password = process.env.VAULTER_PASSWORD ?? '';
if (!password) {
    process.stdout.write(
        'No VAULTER_PASSWORD: no sealed secrets in this build.\n',
    );
    process.exit(0);
}
if (password.length < 16) {
    // The sealed file is public.
    throw new Error('VAULTER_PASSWORD must be at least 16 characters');
}

const secrets = secretsIn(process.env);
const file = await seal(password, secrets, { salt: saltIn(process.env) });
await writeFile(out, `${JSON.stringify(file)}\n`);

const names = Object.keys(secrets).sort((a, b) => a.localeCompare(b));
process.stdout.write(
    `Sealed ${names.join(', ') || 'no secrets'} into ${out}.\n`,
);
