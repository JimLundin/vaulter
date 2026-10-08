// Computes the slow derivations (app/extensions/heavy.ts) off the main thread.
import { computeHeavy } from '../extensions/heavy.ts';
import type { VaultFile } from './files.ts';

globalThis.onmessage = (e: MessageEvent<{ id: number; files: VaultFile[] }>) => {
  globalThis.postMessage({ id: e.data.id, heavy: computeHeavy(e.data.files) });
};
