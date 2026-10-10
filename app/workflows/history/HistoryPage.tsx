// History is a removable workflow. It receives the vault's node history from Product.
import { HistorySurface, Text } from '../../ui/kit/index.ts';
import { NodeHistory, type NodeHistorySource } from './NodeHistory.tsx';

export function HistoryPage({ nodes }: { nodes?: NodeHistorySource }) {
  return (
    <HistorySurface>
      {nodes ? <NodeHistory history={nodes} /> : <Text tone="subtle">Opening the node store…</Text>}
    </HistorySurface>
  );
}
