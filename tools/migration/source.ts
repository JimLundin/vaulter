// The vault's Git history as the migration reads it: first-parent commits, their page files and
// renames, file contents, and the application's own node history on the source branch.
import { execFileSync, spawnSync } from 'node:child_process';
import { validateRecords } from '../../app/vault/nodes/history.ts';
import { type NodeRecord, parseRecord } from '../../app/vault/nodes/validation.ts';

export interface Person {
  readonly name: string;
  readonly email: string;
  readonly at: string;
}
export interface Commit {
  readonly hash: string;
  readonly parents: readonly string[];
  readonly author: Person;
  readonly message: string;
}
export const NODE_PREFIX = '.vaulter/nodes/v1/transactions/';
/** Transaction IDs of earlier migrations, which a run replaces. */
export const MIGRATED = /^(migration|vault):/;
/** Vault knowledge kept as files; the application's code and data that once lived here are not. */
export const isPage = (path: string) =>
  /\.(md|mdx|yaml)$/.test(path) && !/^(site|\.github|\.vaulter)\//.test(path);

export function openSource(vault: string, ref: string) {
  const git = (...args: string[]) =>
    execFileSync('git', ['-C', vault, ...args], { encoding: 'utf8', maxBuffer: 1 << 30 });
  const head = git('rev-parse', ref).trim();
  const commits = new Map<string, Commit>();
  // biome-ignore lint/security/noSecrets: a git log format, not a secret
  const log = git('log', '--format=%H%x00%P%x00%an%x00%ae%x00%aI%x00%B%x1e', head);
  for (const raw of log.split('\x1e')) {
    const [hash, parents, name, email, at, message] = raw.replace(/^\n/, '').split('\x00');
    if (message === undefined) continue;
    commits.set(hash!, {
      hash: hash!,
      parents: parents ? parents.split(' ') : [],
      author: { name: name!, email: email!, at: at! },
      message: message.replace(/\n+$/, ''),
    });
  }
  const blobs = new Map<string, string>();
  return {
    git,
    head,
    commits,
    firstParent: git('rev-list', '--first-parent', '--reverse', head).trim().split('\n'),
    /** The page files at a commit: path → blob. */
    treeAt: (commit: string) => {
      const files = new Map<string, string>();
      for (const entry of git('ls-tree', '-r', '-z', commit).split('\0')) {
        const m = /^\d+ blob ([0-9a-f]+)\t(.+)$/s.exec(entry);
        if (m && isPage(m[2]!)) files.set(m[2]!, m[1]!);
      }
      return files;
    },
    /** The files a commit renamed, as Git detects them. */
    renamesAt: (commit: string, parent: string | undefined) => {
      const fields = (
        parent
          ? git('diff-tree', '-r', '-M', '-z', '--name-status', parent, commit)
          : git('diff-tree', '-r', '--root', '-z', '--name-status', commit)
      ).split('\0');
      const renames: [from: string, to: string][] = [];
      for (let i = 0; i < fields.length; ) {
        const status = fields[i++];
        if (!status) continue;
        if (/^[RC]/.test(status)) {
          const from = fields[i++]!;
          const to = fields[i++]!;
          if (status.startsWith('R')) renames.push([from, to]);
        } else i++;
      }
      return renames;
    },
    /** Read these blobs in one batch, keeping what was read before. */
    readBlobs: (shas: Iterable<string>) => {
      const missing = [...new Set(shas)].filter((sha) => !blobs.has(sha));
      if (!missing.length) return;
      const out = spawnSync('git', ['-C', vault, 'cat-file', '--batch'], {
        input: `${missing.join('\n')}\n`,
        maxBuffer: 1 << 30,
      }).stdout;
      for (let at = 0; at < out.length; ) {
        const nl = out.indexOf(10, at);
        const [sha, , size] = out.subarray(at, nl).toString().split(' ');
        blobs.set(sha!, out.subarray(nl + 1, nl + 1 + Number(size)).toString('utf8'));
        at = nl + 2 + Number(size);
      }
    },
    blob: (sha: string) => {
      const text = blobs.get(sha);
      if (text === undefined) throw new Error(`Blob ${sha} was not read`);
      return text;
    },
    /** Commits a merge brought in from its side branches. */
    sideCommits: (commit: Commit) =>
      commit.parents
        .slice(1)
        .flatMap((p) => git('rev-list', p, `^${commit.parents[0]}`).trim().split('\n'))
        .filter(Boolean),
    /** The application's own node history on the branch, without any earlier migration. */
    nodeHistory: (): readonly NodeRecord[] =>
      validateRecords(
        git('ls-tree', '-r', '-z', '--name-only', head, '--', NODE_PREFIX)
          .split('\0')
          .filter((p) => p && !MIGRATED.test(decodeURIComponent(p.slice(NODE_PREFIX.length))))
          .map((p) => parseRecord(JSON.parse(git('show', `${head}:${p}`))))
          .sort((a, b) => a.transaction.sequence - b.transaction.sequence),
      ),
  };
}
export type Source = ReturnType<typeof openSource>;
