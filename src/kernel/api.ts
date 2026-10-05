// What extensions and contracts import, as `#kernel`. The page has one copy of this module,
// shared by every extension.
export type { Access, Guarded } from './access.ts';
export { type Contract, defineContract } from './contract.ts';
export { defineExtension, type Statics } from './extension.ts';
export { perCaller } from './per-caller.ts';
export { Declined } from './policy.ts';

/** Stops what it was given for: a listener, a handler, a tool. */
export type Unsubscribe = () => void;
