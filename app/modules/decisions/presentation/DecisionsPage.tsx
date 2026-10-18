import { useId, useRef, useState } from 'react';
import {
  Button,
  Field,
  FieldLabel,
  Input,
  Loader,
  Overlay,
  PageControls,
  PageHeader,
  ReadingColumn,
  Row,
  Stack,
  Text,
  TextBox,
} from '@/shared/ui/kit/index.ts';
import type {
  DecisionData,
  DecisionInput,
  DecisionPatch,
  DecisionRecord,
  DecisionRef,
} from '@/modules/decisions/index.ts';
import { DecisionList } from './DecisionList.tsx';

export interface DecisionActions {
  create: (input: DecisionInput) => Promise<void>;
  revise: (decision: DecisionRef, patch: DecisionPatch) => Promise<void>;
  remove: (decision: DecisionRef) => Promise<void>;
}

function DecisionEditor({
  decision,
  actions,
  onClose,
  onBusy,
}: {
  decision?: DecisionRecord;
  actions: DecisionActions;
  onClose: () => void;
  onBusy: (busy: boolean) => void;
}) {
  const dateId = useId();
  const [text, setText] = useState(decision?.text ?? '');
  const [rationale, setRationale] = useState(decision?.rationale ?? '');
  const [date, setDate] = useState(decision?.date ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const pending = useRef(false);
  const save = async () => {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    onBusy(true);
    setError(undefined);
    try {
      if (decision)
        await actions.revise(decision, { text, date: date || null, rationale: rationale || null });
      else await actions.create({ text, ...(date && { date }), ...(rationale && { rationale }) });
      onClose();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      pending.current = false;
      setBusy(false);
      onBusy(false);
    }
  };
  return (
    <Stack>
      <TextBox
        label="Decision text"
        layout="longform"
        draft={text}
        onDraftChange={setText}
        disabled={busy}
      />
      <Field>
        <FieldLabel htmlFor={dateId}>Decision date (optional)</FieldLabel>
        <Input
          id={dateId}
          type="date"
          value={date}
          disabled={busy}
          onChange={(event) => setDate(event.currentTarget.value)}
        />
      </Field>
      <TextBox
        label="Rationale (optional)"
        layout="longform"
        draft={rationale}
        onDraftChange={setRationale}
        disabled={busy}
      />
      {!!error && (
        <Text role="alert" tone="danger">
          {error}
        </Text>
      )}
      <Row>
        <Button disabled={busy || !text.trim()} onClick={save}>
          {busy ? 'Saving…' : 'Save decision'}
        </Button>
        <Button variant="ghost" disabled={busy} onClick={onClose}>
          Cancel
        </Button>
      </Row>
    </Stack>
  );
}

export function DecisionsPage({
  data,
  error,
  actions,
  disabledReason,
}: {
  data?: DecisionData;
  error?: string;
  actions?: DecisionActions;
  disabledReason?: string;
}) {
  const [editor, setEditor] = useState<{ decision?: DecisionRecord }>();
  const [removal, setRemoval] = useState<DecisionRecord>();
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string>();
  const add = actions && (
    <Button
      size="compact"
      compactIcon="plus"
      aria-label="Add decision"
      disabled={!!disabledReason || busy}
      onClick={() => setEditor({})}
    >
      Add decision
    </Button>
  );
  return (
    <>
      <PageControls placement="rail" actions={add} />
      <ReadingColumn label="Decisions workspace">
        <PageHeader title="Decisions" />
        <Stack grow={true} inset="page" block="md" gap="lg">
          <PageControls placement="expanded" actions={add} />
          {!!disabledReason && (
            <Text tone="muted" size="sm">
              {disabledReason}
            </Text>
          )}
          {error ? (
            <Text role="alert" tone="danger">
              {error}
            </Text>
          ) : !data ? (
            <Loader>Opening decisions…</Loader>
          ) : (
            <DecisionList
              decisions={data}
              disabled={!!disabledReason || busy}
              onEdit={actions ? (decision) => setEditor({ decision }) : undefined}
              onRemove={
                actions
                  ? (decision) => {
                      setActionError(undefined);
                      setRemoval(decision);
                    }
                  : undefined
              }
            />
          )}
        </Stack>
      </ReadingColumn>
      {!!actions && (
        <Overlay
          open={!!editor}
          onClose={() => {
            if (!busy) setEditor(undefined);
          }}
          title={editor?.decision ? 'Edit decision' : 'Add decision'}
          description="Record the choice and its rationale, where known."
        >
          {!!editor && (
            <DecisionEditor
              decision={editor.decision}
              actions={actions}
              onClose={() => setEditor(undefined)}
              onBusy={setBusy}
            />
          )}
        </Overlay>
      )}
      {!!actions && (
        <Overlay
          open={!!removal}
          onClose={() => {
            if (!busy) setRemoval(undefined);
          }}
          title="Remove decision"
          description="The decision will leave the log. Its recorded history remains."
        >
          <Stack>
            <Text>{removal?.text}</Text>
            {!!actionError && (
              <Text role="alert" tone="danger">
                {actionError}
              </Text>
            )}
            <Row>
              <Button
                disabled={busy || !!disabledReason}
                onClick={async () => {
                  if (!removal || busy) return;
                  setBusy(true);
                  try {
                    await actions.remove(removal);
                    setRemoval(undefined);
                  } catch (failure) {
                    setActionError(failure instanceof Error ? failure.message : String(failure));
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {busy ? 'Removing…' : 'Remove decision'}
              </Button>
              <Button variant="ghost" disabled={busy} onClick={() => setRemoval(undefined)}>
                Keep decision
              </Button>
            </Row>
          </Stack>
        </Overlay>
      )}
    </>
  );
}
