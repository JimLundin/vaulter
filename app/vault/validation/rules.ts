// The vault's durable file and write rules, independent of installed workflows.
import type { FileRules } from '../files.ts';
import { noteFiles } from './notes-problems.ts';
import { newGraphProblems } from './graph-problems.ts';

export const vaultRules: FileRules = {
  keeps: noteFiles.keeps,
  what: noteFiles.what,
  problems: async (before, after) =>
    (
      await Promise.all([noteFiles.problems(before, after), newGraphProblems(before, after)])
    ).flat(),
};
