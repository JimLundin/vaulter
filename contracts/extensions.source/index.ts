// Extension source in git, besides main (which is the page's own): drafts on draft/* branches and older
// commits, read at a commit, and CI's checks on them. source-github provides it; moving to another
// host means another provider.
import { defineContract } from '@vaulter/kernel';

export interface SourceFile {
  path: string;
  /** The blob's id: the same text has the same sha, so compiled output is cached by it. */
  sha: string;
}

export interface Checks {
  state: 'none' | 'pending' | 'success' | 'failure';
  runs: { name: string; state: string }[];
}

export interface SourceV1 {
  /** The commit `ref` (a branch, a tag or a commit) points at now, in `repo` ("owner/name"). */
  head: (repo: string, ref: string) => Promise<string>;
  /** The files under extensions/ and contracts/ at `commit`. */
  tree: (repo: string, commit: string) => Promise<SourceFile[]>;
  read: (repo: string, path: string, sha: string) => Promise<string>;
  /** The branches: the main one, and drafts (draft/*). */
  refs: (repo: string) => Promise<string[]>;
  /** CI's checks on a commit. */
  checks: (repo: string, commit: string) => Promise<Checks>;
}

export const source = defineContract<SourceV1>({ name: 'extensions.source', version: 1 });
