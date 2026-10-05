// What extensions import as #kernel: the other extensions in the page, to find their agreed exports.
export { extensions, type Loaded, started } from './kernel.ts';

/** Stops what it was given for: a listener, a handler. */
export type Unsubscribe = () => void;
