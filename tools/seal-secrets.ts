// Seal the app's secrets with its password into a secrets.json for the published app (app/core/sealed.ts).
// Runs in CI (.github/workflows/deploy.yml), from the repo's secrets; nothing is committed.
//   VAULT_PASSWORD      the app's password (at least 12 characters)
//   VAULT_SALT          base64, fixed: keeps remembered devices signed in across publishes; change it to sign them out
//   VAULT_GITHUB_TOKEN  fine-grained, vault and vaulter only, Contents read/write and Metadata read
//   VAULT_OPENAI_KEY    optional
//   VAULT_JINA_KEY      optional: the agent's web search (reading pages works without it)
// Usage: node tools/seal-secrets.ts dist/secrets.json
import { writeFileSync } from 'node:fs';
import { seal } from '../app/core/sealed.ts';

const fail = (m: string) => {
  console.error(m);
  process.exit(1);
};
const out = process.argv[2] ?? fail('usage: node tools/seal-secrets.ts <out.json>');
const {
  VAULT_PASSWORD: password = '',
  VAULT_SALT: salt = '',
  VAULT_GITHUB_TOKEN: github = '',
  VAULT_OPENAI_KEY: openai = '',
  VAULT_JINA_KEY: jina = '',
} = process.env;

if (password.length < 12)
  fail('VAULT_PASSWORD is missing or under 12 characters: the sealed file is public.');
if (!/^[A-Za-z0-9+/]{22}==$/.test(salt))
  fail(
    'VAULT_SALT is missing: set the repo variable to 16 random bytes, base64 (openssl rand -base64 16).',
  );
if (!/^(github_pat_|ghp_)\w+$/.test(github.trim()))
  fail('VAULT_GITHUB_TOKEN is missing or not a GitHub token.');

writeFileSync(
  out!,
  `${JSON.stringify(
    await seal(
      {
        github: github.trim(),
        ...(openai.trim() ? { openai: openai.trim() } : {}),
        ...(jina.trim() ? { jina: jina.trim() } : {}),
      },
      password,
      salt,
    ),
  )}\n`,
);
const sealed = [
  'the GitHub token',
  openai.trim() && 'the OpenAI key',
  jina.trim() && 'the Jina key',
];
console.log(`sealed ${sealed.filter(Boolean).join(', ')} into ${out}`);
