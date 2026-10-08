// Computes the slow derivations (core/heavy.ts) off the main thread.
import { computeHeavy } from '../../core/heavy.ts';
import { vaultOf } from '../../core/derive.ts';
import type { VaultFile } from '../../core/vault.ts';

globalThis.onmessage = (e: MessageEvent<{ id: number; files: VaultFile[] }>) => {
  globalThis.postMessage({ id: e.data.id, heavy: computeHeavy(vaultOf(e.data.files)) });
};
