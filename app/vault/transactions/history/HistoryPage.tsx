// Core History presents transactions; Application supplies content-owner compensation policy.
import { FeaturePage, Stack, Text } from '../../../ui/kit/index.ts';
import { HistoryList } from './NodeHistory.tsx';
import type { HistorySource } from './entries.ts';

export function HistoryPage({ history }: { history?: HistorySource }) {
  return (
    <FeaturePage title="History" description="Changes to your vault, newest first.">
      <Stack gap="lg">
        {history ? <HistoryList history={history} /> : <Text tone="subtle">Opening history…</Text>}
      </Stack>
    </FeaturePage>
  );
}
