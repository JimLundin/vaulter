// What extensions import as #kernel.

export { extensions, type Loaded, started } from './kernel.ts';

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
