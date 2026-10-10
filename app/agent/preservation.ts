// Producer-owned compensation policy; generic History never imports execution modules.
import type { NodeDifference } from '../vault/nodes/store.ts';

const executionKinds = new Set(['agentRun', 'contextInput', 'toolExecution', 'metadataReference']);
/** True only when neither side is an execution record or retained execution reference. */
export function preservesAgentRecords({ before, after }: NodeDifference): boolean {
  return [before, after].every((version) => !executionKinds.has(String(version?.data?.kind)));
}
