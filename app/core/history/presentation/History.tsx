import type { ReactNode } from 'react';
// Core transaction utility; Application supplies the current session and compensation policy.
import { Drawer, Surface, Text } from '@/shared/ui/kit/index.ts';
import { HistoryList } from './HistoryList.tsx';
import type { HistorySource } from '@/core/history/entries.ts';

export function HistoryDrawer({
  open,
  onClose,
  history,
  children,
}: {
  open: boolean;
  onClose: () => void;
  history?: HistorySource;
  children?: ReactNode;
}) {
  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="History"
      description="Recorded changes to your vault"
    >
      <Surface variant="preferences">
        {children && <Surface variant="groupHeading">{children}</Surface>}
        {history ? <HistoryList history={history} /> : <Text tone="subtle">Opening history…</Text>}
      </Surface>
    </Drawer>
  );
}
