// The full committed node baseline, including published imports; never discard an existing prefix.
import { execFileSync } from 'node:child_process';
import { validateRecords } from '../../app/vault/nodes/history.ts';
import { parseRecord } from '../../app/vault/nodes/validation.ts';
import { NODE_PREFIX } from './source.ts';

export function publishedVault(vault: string, ref = 'HEAD') {
  const git = (...args: string[]) =>
    execFileSync('git', ['-C', vault, ...args], { encoding: 'utf8', maxBuffer: 1 << 30 });
  const head = git('rev-parse', ref).trim();
  const records = validateRecords(
    git('ls-tree', '-r', '-z', '--name-only', head, '--', NODE_PREFIX)
      .split('\0')
      .filter(Boolean)
      .map((path) => parseRecord(JSON.parse(git('show', `${head}:${path}`))))
      .sort((a, b) => a.transaction.sequence - b.transaction.sequence),
  );
  if (!records.length)
    throw new Error('No published node baseline: run the initial importer first');
  return { head, records };
}
