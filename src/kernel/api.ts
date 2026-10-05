// What extensions import as #kernel: the extensions in this page, and turning one on or off.
export {
  type About,
  type ExtensionInfo,
  extensions,
  running,
  setEnabled,
  started,
} from './kernel.ts';

/** Stops what it was given for: a listener, a handler. */
export type Unsubscribe = () => void;
