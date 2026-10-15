// Public entry consumed by the private Vault's CI: node tools/check.ts --vault <dir>.
// The Markdown note/schema/graph implementation stays under vault-check, outside the app.
import { checkVault } from './vault-check/validation/check.ts';
import { readVaultFiles, vaultArg } from './vault-check/fs.ts';

const { problems, ok, files } = checkVault(readVaultFiles(vaultArg()));
if (problems.length) {
  console.error(`✗ ${problems.length} problem(s):`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log(`✓ ${ok} internal links resolve (${files} files)`);
