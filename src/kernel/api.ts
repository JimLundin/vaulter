// What extensions import as #kernel: the extensions in this page, and turning one on, off or away.
export { blame, type ErrorEntry, errorsOf } from './errors.ts';
export {
  type About,
  type ExtensionInfo,
  extensions,
  remove,
  running,
  setEnabled,
  started,
} from './kernel.ts';

/** Stops what it was given for: a listener, a handler. */
export type Unsubscribe = () => void;
