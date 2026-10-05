// Where extension source comes from, and where Vaulter's drafts go: a git host, read at a commit and written
// on branches. The kernel's bootstrap set provides it (source-github, or source-dev under `npm run dev`);
// moving to another host means another provider. Requiring it lets an extension write the repo, which
// the review screen shows.
import { defineContract } from '@vaulter/kernel';

export interface SourceFile {
  path: string;
  /** The blob's id: the same text has the same sha, so compiled output is cached by it. */
  sha: string;
}

export interface Change {
  path: string;
  /** The new text, or null to delete the file. */
  content: string | null;
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
  /** One commit on a draft branch (draft/*) with every change; the branch is made from `base` if it
   * doesn't exist. Only files under extensions/ and contracts/: the kernel is never written here.
   * Never forced: if the branch moved since `parent`, it fails. Returns the new commit. */
  commit: (
    repo: string,
    change: { branch: string; base?: string; parent?: string; message: string; files: Change[] },
  ) => Promise<string>;
  /** Merges `head` into `base`; returns the merge commit. Personal: accepting a draft is a person's
   * to do, on the review screen; main deploys with it, and every device has it on its next start. */
  merge: (repo: string, base: string, head: string, message: string) => Promise<string>;
  /** CI's checks on a commit. */
  checks: (repo: string, commit: string) => Promise<Checks>;
}

export const source = defineContract<SourceV1>({
  name: 'extensions.source',
  version: 1,
  personal: ['merge'],
});
