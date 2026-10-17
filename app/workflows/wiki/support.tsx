import { Row, Text } from '@/ui/kit/index.ts';
import type { SupportState } from './view.ts';

export function SupportIndicators({ state }: { state?: SupportState }) {
  if (!state) return null;
  const labels = [
    state.partlySupported
      ? 'Partly supported'
      : state.needsReference
        ? 'Needs reference'
        : state.supported
          ? 'Supported'
          : undefined,
    state.disputed ? 'Disputed' : undefined,
    state.needsReview ? 'Needs review' : undefined,
  ].filter(Boolean);
  if (!labels.length) return null;
  return (
    <Row wrap={true} aria-label="Evidence coverage">
      {labels.map((label) => (
        <Text key={label} size="xs" tone="muted">
          {label}
        </Text>
      ))}
    </Row>
  );
}
