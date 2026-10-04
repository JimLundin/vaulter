// Seals the secrets into the built page: node tools/seal-secrets.ts dist/secrets.json
// In CI (deploy.yml), from the repo's secrets: VAULTER_PASSWORD, and one VAULTER_SECRET__<EXTENSION>__<NAME> per
// secret ("VAULTER_SECRET__OPENAI__KEY" → openai/key, "VAULTER_SECRET__SOURCE_GITHUB__TOKEN" →
// source-github/token), each named in deploy.yml (or given together as VAULTER_SECRETS_JSON). VAULTER_SALT
// (16 bytes, base64; a repo variable, set once) keeps the salt the same across deploys, so devices
// that unlocked once take each new file without asking again.
import { writeFile } from 'node:fs/promises';
import { seal } from '../src/kernel/sealed.ts';

const out = process.argv[2];
if (!out) throw new Error('usage: node tools/seal-secrets.ts <out.json>');

const password = process.env.VAULTER_PASSWORD ?? '';
if (!password) {
  console.log('No VAULTER_PASSWORD: no sealed secrets in this build.');
  process.exit(0);
}
if (password.length < 16)
  throw new Error('VAULTER_PASSWORD must be at least 16 characters: the sealed file is public');

const all: Record<string, string | undefined> = {
  ...JSON.parse(process.env.VAULTER_SECRETS_JSON ?? '{}'),
  ...process.env,
};
const secrets: Record<string, string> = {};
for (const [k, v] of Object.entries(all)) {
  const m = /^VAULTER_SECRET__([A-Z0-9_]+?)__([A-Z0-9_]+)$/.exec(k);
  if (!(m && v)) continue;
  const ext = m[1].toLowerCase().replaceAll('_', '-');
  const name = m[2].toLowerCase().replaceAll('_', '.');
  secrets[`${ext}/${name}`] = v;
}

const salt = process.env.VAULTER_SALT
  ? Uint8Array.from(atob(process.env.VAULTER_SALT), (c) => c.charCodeAt(0))
  : undefined;
if (salt && salt.length < 16) throw new Error('VAULTER_SALT must be 16 bytes, base64');
await writeFile(out, `${JSON.stringify(await seal(password, secrets, { salt }))}\n`);
console.log(`Sealed ${Object.keys(secrets).sort().join(', ') || 'no secrets'} into ${out}.`);
