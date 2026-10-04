// Where extension source comes from: a git host, read at a commit. The kernel's bootstrap set provides it
// (source-github, or source-dev under `npm run dev`); moving to another host means another provider.
import { defineContract } from '@pip/kernel';
import { z } from 'zod';

export interface SourceFile {
  path: string;
  /** The blob's id: the same text has the same sha, so compiled output is cached by it. */
  sha: string;
}

export interface SourceV1 {
  /** The commit `ref` (a branch, a tag or a commit) points at now, in `repo` ("owner/name"). */
  head: (repo: string, ref: string) => Promise<string>;
  /** The files under extensions/ and contracts/ at `commit`. */
  tree: (repo: string, commit: string) => Promise<SourceFile[]>;
  read: (repo: string, path: string, sha: string) => Promise<string>;
  /** The branches, for safe mode and for trying a draft. */
  refs: (repo: string) => Promise<string[]>;
}

const repo = z.string().regex(/^[\w.-]+\/[\w.-]+$/, { message: 'owner/name' });

export const source = defineContract<SourceV1>({
  name: 'extensions.source',
  version: '1.0.0',
  inputs: {
    head: z.tuple([repo, z.string().min(1)]),
    tree: z.tuple([repo, z.string().min(1)]),
    read: z.tuple([repo, z.string().min(1), z.string().min(1)]),
    refs: z.tuple([repo]),
  },
});
