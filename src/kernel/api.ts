// Helpers every extension may use, imported as #kernel.

/** Stops what it was given for: a listener, a handler. */
export type Unsubscribe = () => void;

/** `value` without `keys`. */
export function omit<T extends object, K extends keyof T>(
    value: T,
    ...keys: K[]
): Omit<T, K> {
    const rest = { ...value };
    for (const key of keys) {
        delete rest[key];
    }
    return rest;
}

/** A queue: tasks given to it run one after another, each once the one
 * before has finished, whether that succeeded or failed. Each call returns
 * its own task's result. */
export function queue() {
    let last: Promise<unknown> = Promise.resolve();
    return <T>(task: () => Promise<T>): Promise<T> => {
        const next = last.then(task);
        // The only catch: the next task runs whatever this one does. It also
        // marks `next` as handled, so a task nobody awaits can fail quietly.
        last = next.catch(() => undefined);
        return next;
    };
}

/** What went wrong, as words, whatever was thrown. */
export function messageOf(error: unknown) {
    return error instanceof Error ? error.message : String(error);
}
