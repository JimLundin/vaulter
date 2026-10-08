// The agent's tools over the app's own source (vaulter), so the app can grow with use: new extensions, fixes,
// changes to the agent itself. Loaded with the agent, when the sealed token can write to vaulter.
import { tool, type ToolSet } from 'ai';
import { z } from 'zod';
import { API, APP_REPO, github } from '../../github/api.ts';
import { codeRepo, type CodeRepo } from './repo.ts';

const LIST_MAX = 400;

let shared: { token: string; repo: CodeRepo } | null = null;
/** One workspace per token for the session, so staged code edits survive between turns. */
const workspace = (token: string) => {
  if (shared?.token !== token)
    shared = { token, repo: codeRepo(github(token, APP_REPO), APP_REPO, API) };
  return shared.repo;
};

const ABOUT = `The app's own source: the public repo ${APP_REPO.owner}/${APP_REPO.name} (TypeScript, React, Vite), not the vault.`;

export const codeTools = (token: string, repo: CodeRepo = workspace(token)) =>
  ({
    listCode: tool({
      description: `${ABOUT} List its files, optionally under a prefix ("app/extensions/"). Start with README.md and ARCHITECTURE.md: how it fits together and how to add a feature (an extension).`,
      inputSchema: z.object({ prefix: z.string().optional() }),
      execute: async ({ prefix }) => {
        const all = await repo.list(prefix);
        return all.length > LIST_MAX
          ? { files: all.slice(0, LIST_MAX), more: all.length - LIST_MAX }
          : { files: all };
      },
    }),
    readCode: tool({
      description: `${ABOUT} Read a file, with any staged code edits.`,
      inputSchema: z.object({ path: z.string() }),
      execute: async ({ path }) =>
        (await repo.read(path)) ?? { error: `no such text file: ${path}` },
    }),
    searchCode: tool({
      description: `${ABOUT} Find lines containing a string (case-insensitive), optionally under a prefix: path:line: text.`,
      inputSchema: z.object({ query: z.string(), prefix: z.string().optional() }),
      execute: async ({ query, prefix }) => ({ hits: await repo.search(query, prefix) }),
    }),
    writeCode: tool({
      description: `${ABOUT} Stage a whole file's new text (create or replace). Nothing changes until commitCode. Follow the code's style (biome.json: 2 spaces, single quotes, semicolons, trailing commas, 100 columns) and its rules (ARCHITECTURE.md); add or update tests for what you change.`,
      inputSchema: z.object({ path: z.string(), text: z.string() }),
      execute: ({ path, text }) => {
        repo.stage(path, text);
        return { staged: repo.staged() };
      },
    }),
    deleteCode: tool({
      description: `${ABOUT} Stage deleting a file.`,
      inputSchema: z.object({ path: z.string() }),
      execute: async ({ path }) => {
        if ((await repo.read(path)) === null) return { error: `no such file: ${path}` };
        repo.stage(path, null);
        return { staged: repo.staged() };
      },
    }),
    commitCode: tool({
      description: `${ABOUT} Commit every staged code edit to its main as one commit, with this message (a short line on what and why). Only for a change Jim asked for or agreed to (conventions §16). The push runs lint, the type check and the tests, and deploys only if they pass: follow up with codeStatus, and if it fails, fix it with another commit. Jim gets the new version when he reloads the app.`,
      inputSchema: z.object({ message: z.string() }),
      execute: async ({ message }) => {
        try {
          return { committed: await repo.commit(message) };
        } catch (e) {
          return { error: (e as Error).message, staged: repo.staged() };
        }
      },
    }),
    codeStatus: tool({
      description: `${ABOUT} The CI runs for a commit (default: main): each run's status and conclusion, what failed (lint, type check, tests), and the commit the published app is built from. Runs take a few minutes; while one is queued or in progress, say so rather than waiting.`,
      inputSchema: z.object({ commit: z.string().optional() }),
      execute: async ({ commit }) => {
        const sha = commit ?? (await repo.latest());
        try {
          return { commit: sha, ...(await repo.status(sha)) };
        } catch (e) {
          return { error: (e as Error).message };
        }
      },
    }),
  }) satisfies ToolSet;
