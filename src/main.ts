// The page's entry: every extension in extensions/, by its folder's name.

import { start } from './kernel/start.ts';

const folders = import.meta.glob<Record<string, unknown>>(
    '../extensions/*/index.ts',
);

function idOf(path: string) {
    return path.split('/').at(-2) ?? path;
}

void start(
    Object.fromEntries(
        Object.entries(folders).map(([path, importModule]) => [
            idOf(path),
            importModule,
        ]),
    ),
);
