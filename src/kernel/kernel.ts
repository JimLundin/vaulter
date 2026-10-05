// The list of extensions in the page, for those that look for others'
// agreed exports: the agent's `tools`, the shell's `ui`.

export interface Loaded {
    id: string;
    exports: Record<string, unknown>;
}

let loaded: Loaded[] = [];
let resolveStarted: () => void = () => undefined;

/** Resolves once every extension has started. */
export const started = new Promise<void>((resolve) => {
    resolveStarted = resolve;
});

/** Keeps every extension, by id, once each has started. */
export function load(modules: Record<string, Record<string, unknown>>) {
    loaded = Object.entries(modules)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([id, exports]) => ({ id, exports }));
    resolveStarted();
}

/** Every extension in the page, with what it exports, in id order. */
export function extensions() {
    return loaded;
}
