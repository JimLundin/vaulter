import { useState } from 'react';
import type {
  GraphEndpoint,
  GraphRelationshipCandidate,
  RelationshipCandidateActions,
} from '@/modules/graph/index.ts';
import {
  Button,
  Heading,
  Input,
  Label,
  Select,
  Stack,
  Surface,
  Text,
} from '@/shared/ui/kit/index.ts';

const title = (endpoint: GraphEndpoint) =>
  String(
    endpoint.values?.title ??
      endpoint.values?.label ??
      endpoint.values?.key ??
      endpoint.address?.entity ??
      'Unknown',
  );

/** Reusable candidate reading and explicit clarification, supplied with owner-accepted addresses. */
export function RelationshipCandidates({
  candidates,
  endpoints,
  actions,
  disabledReason,
}: {
  candidates: readonly GraphRelationshipCandidate[];
  endpoints: readonly GraphEndpoint[];
  actions?: RelationshipCandidateActions;
  disabledReason?: string;
}) {
  return (
    <Stack gap="lg">
      <Heading level={2}>Relationships to clarify</Heading>
      {!candidates.length && <Text>No relationships need clarification.</Text>}
      {candidates.map((candidate) => (
        <Candidate
          key={candidate.address.transaction + candidate.id}
          candidate={candidate}
          endpoints={endpoints}
          actions={actions}
          disabledReason={disabledReason}
        />
      ))}
    </Stack>
  );
}
function Candidate({
  candidate,
  endpoints,
  actions,
  disabledReason,
}: {
  candidate: GraphRelationshipCandidate;
  endpoints: readonly GraphEndpoint[];
  actions?: RelationshipCandidateActions;
  disabledReason?: string;
}) {
  const [predicate, setPredicate] = useState(candidate.predicate ?? '');
  const [source, setSource] = useState(
    candidate.source.address ? JSON.stringify(candidate.source.address) : '',
  );
  const [target, setTarget] = useState(
    candidate.target.address ? JSON.stringify(candidate.target.address) : '',
  );
  const [direction, setDirection] = useState<'unknown' | 'directed'>(candidate.direction);
  const [reason, setReason] = useState(candidate.reason);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const known = [candidate.source, candidate.target, ...endpoints];
  const choices = [
    ...new Map(
      known
        .filter(
          (endpoint) =>
            endpoint.address &&
            (endpoint.state === 'available' ||
              endpoint === candidate.source ||
              endpoint === candidate.target),
        )
        .map((endpoint) => [JSON.stringify(endpoint.address), endpoint]),
    ).entries(),
  ];
  const options = [
    { value: '', label: 'Unknown endpoint' },
    ...choices.map(([value, endpoint]) => ({
      value,
      label: `${title(endpoint)}${endpoint.state === 'deleted' ? ' (deleted)' : ''} · ${endpoint.address!.transaction}`,
    })),
  ];
  const address = (value: string) => choices.find(([key]) => key === value)?.[1].address;
  const save = async (remove = false) => {
    if (!actions) return;
    setBusy(true);
    setError(undefined);
    try {
      if (remove) await actions.remove(candidate.id);
      else
        await actions.clarify(candidate.id, {
          predicate: predicate.trim() || undefined,
          label: candidate.label,
          source: address(source),
          target: address(target),
          direction,
          clarificationReason: reason,
        });
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Unable to save relationship');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Surface
      as="section"
      aria-label={`Clarify ${candidate.label ?? candidate.predicate ?? candidate.id}`}
      variant="subtle"
    >
      <Stack gap="sm">
        <Heading level={3}>{candidate.label ?? candidate.predicate ?? candidate.id}</Heading>
        <Text>{candidate.reason}</Text>
        <Text size="sm" tone="muted">
          Missing: {candidate.missing.join(', ')}
        </Text>
        {!!candidate.provenance && (
          <Text size="sm">
            Source: {title(candidate.provenance)} · {candidate.provenance.address?.transaction}
          </Text>
        )}
        {!!actions && (
          <>
            <Label>
              Predicate
              <Input
                aria-label="Relationship predicate"
                value={predicate}
                onChange={(event) => setPredicate(event.currentTarget.value)}
              />
            </Label>
            <Label>
              Source
              <Select
                aria-label="Relationship source"
                value={source}
                options={options}
                onChange={(event) => setSource(event.currentTarget.value)}
              />
            </Label>
            <Label>
              Target
              <Select
                aria-label="Relationship target"
                value={target}
                options={options}
                onChange={(event) => setTarget(event.currentTarget.value)}
              />
            </Label>
            <Label>
              Direction
              <Select
                aria-label="Relationship direction"
                value={direction}
                options={[
                  { value: 'unknown', label: 'Unknown direction' },
                  { value: 'directed', label: 'Source → target' },
                ]}
                onChange={(event) =>
                  setDirection(event.currentTarget.value === 'directed' ? 'directed' : 'unknown')
                }
              />
            </Label>
            <Label>
              Clarification reason
              <Input
                aria-label="Clarification reason"
                value={reason}
                onChange={(event) => setReason(event.currentTarget.value)}
              />
            </Label>
            <Button
              disabled={busy || !!disabledReason}
              onClick={() => {
                save().catch(() => setError('Unable to save relationship'));
              }}
            >
              Save clarification
            </Button>
            <Button
              variant="ghost"
              disabled={busy || !!disabledReason}
              onClick={() => {
                save(true).catch(() => setError('Unable to save relationship'));
              }}
            >
              Mark unavailable
            </Button>
          </>
        )}
        {!!disabledReason && <Text>{disabledReason}</Text>}
        {!!error && <Text role="alert">{error}</Text>}
      </Stack>
    </Surface>
  );
}
