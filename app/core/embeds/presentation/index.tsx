import { useState, useRef } from 'react';
import { SaveError } from '@/core/store/index.ts';
import type { RecordEmbed } from '@/core/embeds/index.ts';
import { Button, Row, Select, Stack, Text } from '@/shared/ui/kit/index.ts';

export interface EmbedChoice {
  readonly key: string;
  readonly label: string;
  readonly target: RecordEmbed['target'];
}
export interface EmbedPlacement {
  readonly key: string;
  readonly label: string;
  readonly mode: RecordEmbed['mode'];
}

/** Explicit add/remove actions retain failed save retry, independently of caller render replay. */
export function EmbedControls({
  choices,
  placements,
  add,
  remove,
  disabledReason,
  onSaved,
}: {
  choices: readonly EmbedChoice[];
  placements: readonly EmbedPlacement[];
  add: (embed: RecordEmbed) => Promise<unknown>;
  remove: (key: string) => Promise<unknown>;
  disabledReason?: string;
  onSaved?: () => Promise<unknown>;
}) {
  const [selected, setSelected] = useState('');
  const [mode, setMode] = useState<RecordEmbed['mode']>('live');
  const saving = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState<SaveError>();
  const [message, setMessage] = useState('');
  const perform = async (work: () => Promise<unknown>) => {
    if (saving.current || disabledReason) return;
    saving.current = true;
    setBusy(true);
    setError(undefined);
    setMessage('');
    try {
      await work();
      setPending(undefined);
      try {
        await onSaved?.();
      } catch (readFailure) {
        setError(`Saved, but the view could not refresh: ${String(readFailure)}`);
      }
      setMessage('Embedded records saved.');
    } catch (failure) {
      if (failure instanceof SaveError) setPending(failure);
      setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      saving.current = false;
      setBusy(false);
    }
  };
  const choice = choices.find((entry) => entry.key === selected);
  const disabled = busy || !!pending || !!disabledReason;
  return (
    <Stack as="section" aria-label="Embedded records" gap="sm">
      <Row wrap={true}>
        <Select
          aria-label="Record to embed"
          value={selected}
          onChange={(event) => setSelected(event.currentTarget.value)}
          disabled={disabled}
          options={[
            { value: '', label: 'Choose a record…' },
            ...choices.map((entry) => ({ value: entry.key, label: entry.label })),
          ]}
        />
        <Select
          aria-label="Embed state"
          value={mode}
          onChange={(event) => setMode(event.currentTarget.value === 'pinned' ? 'pinned' : 'live')}
          disabled={disabled}
          options={[
            { value: 'live', label: 'Live current data' },
            { value: 'pinned', label: 'Pin recorded state' },
          ]}
        />
        <Button
          disabled={disabled || !choice}
          onClick={() => {
            if (choice) void perform(() => add({ mode, target: choice.target }));
          }}
        >
          Embed record
        </Button>
      </Row>
      {placements.map((placement) => (
        <Row key={placement.key} justify="between">
          <Text>
            {placement.label} · {placement.mode === 'live' ? 'Live' : 'Pinned'}
          </Text>
          <Button
            variant="ghost"
            disabled={disabled}
            aria-label={`Remove embed: ${placement.label}`}
            onClick={() => void perform(() => remove(placement.key))}
          >
            Remove
          </Button>
        </Row>
      ))}
      {disabledReason && (
        <Text role="status" tone="muted">
          {disabledReason}
        </Text>
      )}
      {error && <Text role="alert">{error}</Text>}
      {pending && (
        <Button disabled={busy || !!disabledReason} onClick={() => void perform(pending.retry)}>
          Retry embed save
        </Button>
      )}
      {message && <Text role="status">{message}</Text>}
    </Stack>
  );
}
