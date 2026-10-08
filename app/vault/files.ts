// What the platform knows of a vault: files, a path and its text. What a file means is a feature's (notes
// keeps the pages and the vocabulary, extension.ts `files`).

/** A file as a source supplies it. */
export interface VaultFile {
  path: string;
  text: string;
}

/** One file's new text, or null to delete it: what an edit, a rename or a commit is made of. */
export interface Change {
  path: string;
  text: string | null;
}

/** The files with the changes made. */
export function applyChanges(files: VaultFile[], changes: Change[]): VaultFile[] {
  const out = new Map(files.map((f) => [f.path, f.text]));
  for (const c of changes)
    if (c.text === null) out.delete(c.path);
    else out.set(c.path, c.text);
  return [...out].map(([path, text]) => ({ path, text }));
}

/** What the features say about files (extension.ts `files`): which the app keeps, what they are (for a
 * refusal), and the problems a change to them adds (a write with any is refused). */
export interface FileRules {
  keeps: (path: string) => boolean;
  what: string;
  problems: (before: VaultFile[], after: VaultFile[]) => Promise<string[]>;
}
