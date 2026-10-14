// Core History presents transactions; Product supplies content-owner compensation policy.
import { FeaturePage, Stack, Text } from '../../../ui/kit/index.ts';
import { NodeHistory, type NodeHistorySource } from './NodeHistory.tsx';

export function HistoryPage({ nodes }: { nodes?: NodeHistorySource }) {
  return (
    <FeaturePage title="History" description="Changes to your vault, newest first.">
      <Stack gap="lg">
        {nodes ? (
          <NodeHistory history={nodes} />
        ) : (
          <Text tone="subtle">Opening the node store…</Text>
        )}
      </Stack>
    </FeaturePage>
  );
}
