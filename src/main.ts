// The page's entry: every extension in extensions/, imported once this tab has Vaulter.
import { start } from './kernel/start.ts';

void start(
  Object.fromEntries(
    Object.entries(import.meta.glob<Record<string, unknown>>('../extensions/*/index.ts')).map(
      ([path, importIt]) => [path.split('/').at(-2) ?? path, importIt],
    ),
  ),
);
