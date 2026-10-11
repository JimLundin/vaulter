// Main publishes its new production build together with the retained branch previews.
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { restorePreviews } from './restore-previews.ts';

const repo = process.env.GITHUB_REPOSITORY;
if (!repo) throw new Error('GITHUB_REPOSITORY is required.');
const scratch = mkdtempSync(join(tmpdir(), 'vaulter-main-previews-'));
try {
  restorePreviews(repo, 'dist', scratch);
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
