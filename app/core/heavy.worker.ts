// Computes the slow derivations (app/extensions/heavy.ts) off the main thread.
import { computeHeavy } from '../extensions/heavy.ts';
import { vaultOf } from '../extensions/graph/model/graph.ts';
import type { VaultFile } from '../extensions/notes/model/note.ts';

globalThis.onmessage = (e: MessageEvent<{ id: number; files: VaultFile[] }>) => {
  globalThis.postMessage({ id: e.data.id, heavy: computeHeavy(vaultOf(e.data.files)) });
};
