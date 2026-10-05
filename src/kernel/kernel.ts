// The kernel: the extensions in this page, for those that read others' agreed exports (the agent's
// `tools`, the shell's `ui`). The page imports every folder in extensions/ (start.ts); each extension
// runs once what it imports has, so the module graph is the wiring and the start order.

export interface Loaded {
  id: string;
  exports: Record<string, unknown>;
}

let loaded: Loaded[] = [];
let done: () => void = () => undefined;

/** Resolves once every extension has started. */
export const started = new Promise<void>((ok) => {
  done = ok;
});

/** Every extension, by id, once each has started. */
export function load(modules: Record<string, Record<string, unknown>>) {
  loaded = Object.entries(modules)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([id, exports]) => ({ id, exports }));
  done();
}

/** Every extension in the page, with what it exports, in id order. */
export const extensions = () => loaded;
