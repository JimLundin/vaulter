// What extensions and contracts import, as `#kernel`. The page has one copy of this module,
// shared by every extension.
export { type Contract, defineContract } from './contract.ts';
export { defineExtension, type Statics } from './extension.ts';
export { perCaller } from './per-caller.ts';

/** Stops what it was given for: a listener, a handler, a tool. */
export type Unsubscribe = () => void;
