// The problems a change adds to the graph: its check (check.ts) before and after, what's new. Loads on
// first use, with the Markdown parser it needs.
import type { VaultFile } from '../files.ts';

export async function newGraphProblems(before: VaultFile[], after: VaultFile[]): Promise<string[]> {
  const { checkGraph } = await import('./graph.ts');
  const old = new Set(checkGraph(before).problems);
  return checkGraph(after).problems.filter((p) => !old.has(p));
}

export const graphFiles = { problems: newGraphProblems };
