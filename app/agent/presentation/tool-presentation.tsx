// Recorded Tool execution owns lifecycle presentation; task owners interpret their own receipts.
import { Json, Stack, Text, ToolResult } from '@/ui/kit/index.ts';

import {
  toolStatus,
  toolPresentation,
  type ToolEvidenceState,
  type ToolPresentationAdapter,
} from '@/agent/tool-evidence.ts';
export { toolPresentation, toolStatus, toolSummary, toolLiveLabel } from '@/agent/tool-evidence.ts';
export type {
  RecordedToolEvidence,
  ToolPresentation,
  ToolPresentationAdapter,
  ToolEvidenceState,
} from '@/agent/tool-evidence.ts';

export function RecordedToolExecution({
  evidence,
  adapters = [],
  live = false,
}: {
  evidence: ToolEvidenceState;
  adapters?: readonly ToolPresentationAdapter[];
  live?: boolean;
}) {
  const presentation = toolPresentation(evidence, adapters);
  return (
    <ToolResult
      title={
        presentation?.title ??
        (evidence.version ? `${evidence.name} (${evidence.version})` : evidence.name)
      }
      status={toolStatus(evidence, live)}
      error={evidence.status === 'failed' || evidence.status === 'cancelled'}
      input={evidence.input}
      output={
        presentation || evidence.output !== undefined || evidence.error ? (
          <Stack gap="sm">
            {presentation?.receipt}
            {!!evidence.error && (
              <Text size="sm" tone="danger">
                {evidence.error}
              </Text>
            )}
            {evidence.output !== undefined && <Json value={evidence.output} />}
          </Stack>
        ) : undefined
      }
    />
  );
}
