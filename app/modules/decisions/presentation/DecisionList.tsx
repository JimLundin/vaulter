import { Button, Row, Stack, Text } from '@/shared/ui/kit/index.ts';
import { decisionKey, type DecisionData, type DecisionRecord } from '@/modules/decisions/index.ts';

/** Shared record representation for the global log and foreign embedded compositions. */
export function DecisionList({
  decisions,
  onEdit,
  onRemove,
  disabled,
}: {
  decisions: DecisionData;
  onEdit?: (decision: DecisionRecord) => void;
  onRemove?: (decision: DecisionRecord) => void;
  disabled?: boolean;
}) {
  return (
    <Stack gap="lg">
      {!decisions.length && <Text tone="muted">No decisions recorded.</Text>}
      {decisions.map((decision) => (
        <Stack key={decisionKey(decision)} gap="sm">
          <Text size="sm" tone="muted">
            {decision.date ?? 'Date not recorded'}
          </Text>
          <Text>{decision.text}</Text>
          {decision.rationale !== undefined && <Text tone="muted">{decision.rationale}</Text>}
          {decision.attribution !== undefined && (
            <Text size="sm">Recorded attribution: {decision.attribution}</Text>
          )}
          {!!decision.sources.length && (
            <Text size="sm" tone="muted">
              {decision.sources.length} retained source references
            </Text>
          )}
          {!!(onEdit || onRemove) && (
            <Row>
              {!!onEdit && (
                <Button
                  variant="outline"
                  size="compact"
                  disabled={disabled}
                  aria-label={`Edit ${decision.text}`}
                  onClick={() => onEdit(decision)}
                >
                  Edit
                </Button>
              )}
              {!!onRemove && (
                <Button
                  variant="ghost"
                  size="compact"
                  disabled={disabled}
                  aria-label={`Remove ${decision.text}`}
                  onClick={() => onRemove(decision)}
                >
                  Remove
                </Button>
              )}
            </Row>
          )}
        </Stack>
      ))}
    </Stack>
  );
}
