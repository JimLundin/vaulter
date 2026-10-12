// Shared message presentation and entry mechanics; task owners supply interpretation and actions.
import { type ReactNode, type Ref, useEffect, useState } from 'react';
import { Stack, Text, Prose } from './parts/layout.tsx';
import { Form } from './app.tsx';
import { Button } from './parts/button.tsx';
import { InputGroup, InputGroupAddon, InputGroupTextarea } from './parts/input-group.tsx';
import { Icon } from './icons.tsx';
import { useLayout } from './hooks/use-layout.ts';
import { Surface, OptionStrip } from './primitives.tsx';

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
/** Controlled entry: the owner retains draft lifetime and the authority to accept submission. */
export function Composer({
  draft,
  onDraftChange,
  onSubmit,
  label,
  placeholder,
  canSubmit,
  busy = false,
  disabled = false,
  readOnly = false,
  voice,
  onStop,
  fieldRef,
  onFocusChange,
  sendLabel,
}: {
  draft: string;
  onDraftChange: (text: string) => void;
  onSubmit: (text: string) => void;
  label: string;
  placeholder?: string;
  canSubmit: boolean;
  busy?: boolean;
  disabled?: boolean;
  readOnly?: boolean;
  voice?: { phase: VoicePhase; onClick: () => void; disabled?: boolean };
  onStop?: () => void;
  fieldRef?: Ref<HTMLTextAreaElement>;
  onFocusChange?: (focused: boolean) => void;
  sendLabel?: string;
}) {
  const [focused, setFocused] = useState(false);
  const eligible = !!draft.trim() && canSubmit && !busy;
  const voiceActive = voice && ['connecting', 'listening', 'finishing'].includes(voice.phase);
  const showVoice = voice && !busy && (voiceActive || !focused);
  useEffect(() => {
    if (busy) {
      setFocused(false);
      onFocusChange?.(false);
    }
  }, [busy, onFocusChange]);
  const focus = (value: boolean) => {
    setFocused(value);
    onFocusChange?.(value);
  };
  return (
    <Surface as="fieldset" aria-label="Message composer">
      <Form
        layout="inline"
        onSubmit={(event) => {
          event.preventDefault();
          if (eligible) onSubmit(draft);
        }}
      >
        <InputGroup variant="composer">
          <InputGroupTextarea
            variant="inline"
            ref={fieldRef}
            rows={1}
            aria-label={label}
            placeholder={placeholder}
            value={draft}
            disabled={busy || disabled}
            readOnly={readOnly}
            aria-busy={readOnly}
            onChange={(event) => onDraftChange(event.currentTarget.value)}
            onFocus={() => focus(true)}
            onBlur={() => focus(false)}
            onKeyDown={(event) => {
              // Safari reports Enter confirming composed text with keyCode 229.
              if (
                eligible &&
                event.key === 'Enter' &&
                !event.shiftKey &&
                !event.nativeEvent.isComposing &&
                event.nativeEvent.keyCode !== 229
              ) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
          />
          <InputGroupAddon align="inset-end">
            {!!voice && showVoice && (
              <VoiceButton
                phase={voice.phase}
                onClick={voice.onClick}
                disabled={disabled || voice.disabled}
                busy={busy}
              />
            )}
            {!showVoice && (
              <SendButton
                busy={busy}
                focused={voice ? true : focused}
                disabled={disabled || !eligible}
                onStop={onStop}
                label={sendLabel}
              />
            )}
          </InputGroupAddon>
        </InputGroup>
      </Form>
    </Surface>
  );
}
export function SendButton({
  busy,
  focused,
  disabled,
  onStop,
  label = 'Send',
}: {
  busy?: boolean;
  focused?: boolean;
  disabled?: boolean;
  onStop?: () => void;
  label?: string;
}) {
  return (
    <Button
      type={busy ? 'button' : 'submit'}
      variant={busy ? 'outline' : 'filled'}
      size="standard"
      iconOnly={true}
      aria-label={busy ? 'Stop' : label}
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
}: {
  phase: VoicePhase;
  busy: boolean;
  disabled?: boolean;
  onClick: () => void;
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
}: {
  suggestions: string[];
  onSelect: (text: string) => void;
}) {
  if (!suggestions.length) return null;
  return (
    <Stack as="section" aria-label="Suggested prompts" gap="sm">
      <OptionStrip>
        {suggestions.map((suggestion) => (
          <Button
            key={suggestion}
            type="button"
            variant="outline"
            onClick={() => onSelect(suggestion)}
          >
            {suggestion}
          </Button>
        ))}
      </OptionStrip>
    </Stack>
  );
}
