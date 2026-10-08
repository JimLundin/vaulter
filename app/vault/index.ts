// A live vault, with the shared staged preview. Callers never hold a backend or secrets.
import { useMemo, useRef } from 'react';
import { applyOverlay, useWriter, type Writer } from './changes/writer.ts';
import { useSession } from './session/session.ts';
import type { OpenBackend, VaultBackend } from './storage/backend.ts';
import type { Change, VaultFile } from './files.ts';
import { vaultRules } from './validation/rules.ts';
import { schemaFor } from './documents/notes/schema.ts';
import { notesOf } from './documents/notes/notes.ts';
import { titleOf, excerptOf, hrefOf, kind, asList, topicsOf } from './documents/notes/fields.ts';
import { search, searchIndex } from './documents/search.ts';

export type { Change, VaultFile } from './files.ts';
export { applyChanges } from './files.ts';
export { CheckFailed, Conflict } from './storage/backend.ts';
export type { OpenBackend, CommitSummary } from './storage/backend.ts';
export { graphOf } from './documents/graph.ts';
export { notesOf } from './documents/notes/notes.ts';
export { titleOf, hrefOf, kind } from './documents/notes/fields.ts';
export { schemaOf } from './documents/notes/schema.ts';
export type { Note } from './documents/notes/fields.ts';

export interface Vault {
  files: () => VaultFile[];
  base: () => VaultFile[];
  staged: () => string[];
  stage: (path: string, text: string | null) => Promise<void>;
  stageMany: (changes: Change[]) => Promise<void>;
  commit: ((message: string) => Promise<string>) | null;
  revert: ((sha: string) => Promise<string>) | null;
  history: VaultBackend['history'];
  patch: VaultBackend['patch'];
  problems: () => Promise<string[]>;
}

/** Bind once; asynchronous callers always read the latest writer, even between renders. */
export function liveVault(writer: () => Writer): Vault {
  return {
    base: () => writer().current().base,
    files: () => {
      const current = writer().current();
      return applyOverlay(current.base, current.overlay);
    },
    staged: () => Object.keys(writer().current().overlay?.files ?? {}),
    stage: (path, text) => writer().stage(path, text),
    stageMany: (changes) => writer().stageMany(changes),
    get commit() {
      return writer().commit;
    },
    get revert() {
      return writer().revert;
    },
    get history() {
      return writer().history;
    },
    get patch() {
      return writer().patch;
    },
    problems: () => writer().problems(),
  };
}

export function noteSearchIndex(files: VaultFile[]) {
  return searchIndex(
    notesOf(files).notes.map((note) => ({
      href: hrefOf(note),
      t: titleOf(note),
      e: excerptOf(note),
      a: asList(note.data.aliases),
      k: kind(note.id),
      g: kind(note.id) === 'note' ? topicsOf(note) : [],
    })),
  );
}

export const searchNotes = (vault: Vault, query: string) =>
  search(noteSearchIndex(vault.files()), query);

export function useVaultSession(openBackend: OpenBackend) {
  const session = useSession(openBackend, vaultRules.keeps);
  const writer = useWriter(session.backend, vaultRules, session.head, session.setHead);
  const current = useRef(writer);
  current.current = writer;
  const vault = useMemo(() => liveVault(() => current.current), []);
  const files = useMemo(
    () => (session.head ? applyOverlay(session.head.files, writer.overlay) : null),
    [session.head, writer.overlay],
  );
  const schema = files ? schemaFor(files) : null;
  return {
    vault,
    files,
    status: session.status,
    locked: session.locked,
    signOut: session.signOut,
    // Only product composition receives these, to configure specific external callers.
    secrets: session.secrets,
    blocked: schema instanceof Error ? schema.message : null,
  };
}
