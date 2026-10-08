// The vault's check (app/extensions/check.ts: the notes' and the graph's) over a vault on disk: `node tools/check.ts --vault <dir>` (default the
// working directory). Runs in the vault's CI on every push (its .github/workflows/check.yml).
import { checkVault } from '../app/extensions/check.ts';
import { readVaultFiles, vaultArg } from './fs.ts';

const { problems, ok, files } = checkVault(readVaultFiles(vaultArg()));
if (problems.length) {
  console.error(`✗ ${problems.length} problem(s):`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log(`✓ ${ok} internal links resolve (${files} files)`);
