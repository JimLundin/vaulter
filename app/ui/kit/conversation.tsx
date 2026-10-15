// Shared message presentation and entry mechanics; task owners supply interpretation and actions.
import type { ReactNode } from 'react';
import { Stack, Text, Prose } from './parts/layout.tsx';
import { Button } from './parts/button.tsx';
import { Icon } from './icons.tsx';
import { useLayout } from './hooks/use-layout.ts';
import { Surface } from './primitives.tsx';

/** Generic selection rows; callers supply labels, metadata and current selection. */
export function SelectionList({
  items,
  onSelect,
}: {
  items: readonly { id: string; title: string; meta?: string; current?: boolean }[];
  onSelect: (id: string) => void;
}) {
  if (!items.length) return <Text tone="muted">No items yet.</Text>;
  return (
    <Stack gap="xs" role="list">
      {items.map((item) => (
        <Button
          key={item.id}
          role="listitem"
          variant={item.current ? 'outline' : 'ghost'}
          aria-current={item.current ? 'true' : undefined}
          onClick={() => onSelect(item.id)}
        >
          <Stack gap="none" grow={true}>
            <Text as="span" weight="medium">
              {item.title}
            </Text>
            {!!item.meta && (
              <Text as="span" size="sm" tone="subtle">
                {item.meta}
              </Text>
            )}
          </Stack>
        </Button>
      ))}
    </Stack>
  );
}

/** Neutral message presentation: the owner supplies attribution and reading side. */
export function Message({
  label,
  side = 'start',
  marker,
  persistentLabel = false,
  children,
}: {
  label: string;
  side?: 'start' | 'end';
  marker?: string;
  /** Preserve attribution when reading compact records also requires an explicit label. */
  persistentLabel?: boolean;
  children: ReactNode;
}) {
  const compact = useLayout() === 'compact';
  return (
    <Stack data-message={marker} align={side === 'end' ? 'end' : 'stretch'} gap="sm">
      {(!compact || persistentLabel) && (
        <Text as="span" size="xs" weight="medium" tone="subtle">
          {label}
        </Text>
      )}
      {side === 'end' ? <Surface variant="bubble">{children}</Surface> : <Stack>{children}</Stack>}
    </Stack>
  );
}
export function Markdown({ children }: { children: ReactNode }) {
  return <Prose markdown={true}>{children}</Prose>;
}
export function SendButton({
  busy,
  focused,
  disabled,
  onStop,
  label = 'Send',
  'aria-describedby': describedBy,
}: {
  busy?: boolean;
  focused?: boolean;
  disabled?: boolean;
  onStop?: () => void;
  label?: string;
  'aria-describedby'?: string;
}) {
  return (
    <Button
      type={busy ? 'button' : 'submit'}
      variant={busy ? 'outline' : 'filled'}
      size="standard"
      iconOnly={true}
      aria-label={busy ? 'Stop' : label}
      aria-describedby={describedBy}
      disabled={!busy && disabled}
      onPointerDown={(event) => event.preventDefault()}
      onClick={busy ? onStop : undefined}
    >
      <Icon name={busy ? 'stop' : focused ? 'enter' : 'arrow-up'} />
    </Button>
  );
}
type VoicePhase = 'idle' | 'connecting' | 'listening' | 'finishing' | 'ready' | 'error';
export function VoiceButton({
  phase,
  busy,
  disabled,
  onClick,
  'aria-describedby': describedBy,
}: {
  phase: VoicePhase;
  busy: boolean;
  disabled?: boolean;
  onClick: () => void;
  'aria-describedby'?: string;
}) {
  const waiting = phase === 'connecting' || phase === 'finishing';
  const recording = phase === 'listening';
  const label =
    phase === 'connecting'
      ? 'Cancel recording'
      : recording
        ? 'Finish recording'
        : waiting
          ? 'Finishing transcript'
          : 'Start voice interaction';
  return (
    <Button
      type="button"
      variant="filled"
      size="standard"
      iconOnly={true}
      pending={waiting}
      aria-label={label}
      aria-describedby={describedBy}
      aria-pressed={recording}
      disabled={disabled || busy || phase === 'finishing'}
      onClick={onClick}
    >
      <Icon name={recording ? 'stop' : waiting ? 'clock' : 'mic'} />
    </Button>
  );
}
export function VoiceStatus({ phase, error }: { phase: VoicePhase; error: string }) {
  if (phase === 'idle') return null;
  const label =
    phase === 'connecting'
      ? 'Connecting microphone…'
      : phase === 'listening'
        ? 'Listening… Tap the microphone to finish.'
        : phase === 'finishing'
          ? 'Finishing transcript…'
          : phase === 'ready'
            ? 'Ready to send'
            : 'Recording stopped. Your text is ready to edit or send.';
  return (
    <Text role={error ? 'alert' : 'status'} size="xs" tone={error ? 'danger' : 'muted'}>
      {error || label}
    </Text>
  );
}
export function PromptSuggestions({
  suggestions,
  onSelect,
  label = 'Suggested prompts',
  selected,
  disabled = false,
}: {
  suggestions: readonly { value: string; label: string }[];
  onSelect: (value: string) => void;
  label?: string;
  selected?: string;
  disabled?: boolean;
}) {
  if (!suggestions.length) return null;
  return (
    <Stack as="section" aria-label={label} gap="none">
      {suggestions.map((suggestion) => (
        <Button
          key={suggestion.value}
          type="button"
          variant="suggestion"
          size="compact"
          aria-pressed={selected === undefined ? undefined : selected === suggestion.value}
          disabled={disabled}
          onClick={() => onSelect(suggestion.value)}
        >
          {suggestion.label}
          <Icon name="arrow-up-right" />
        </Button>
      ))}
    </Stack>
  );
}
