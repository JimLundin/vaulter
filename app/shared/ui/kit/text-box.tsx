// One controlled text-entry composition; task owners retain drafts, acceptance and persistence.
import { type ComponentProps, type Ref, useEffect, useId, useState } from 'react';
import { Form } from './app.tsx';
import { SendButton, VoiceButton } from './conversation.tsx';
import { Button } from './parts/button.tsx';
import { FieldError, FieldLabel } from './parts/field.tsx';
import { InputGroup, InputGroupAddon, InputGroupTextarea } from './parts/input-group.tsx';
import { Stack, Text } from './parts/layout.tsx';
import { Surface } from './primitives.tsx';

/** Controlled text entry with shared compact/longform presentation and submission mechanics. */
export function TextBox({
  draft,
  onDraftChange,
  label,
  layout = 'compact',
  description,
  error,
  placeholder,
  onSubmit,
  canSubmit = false,
  submitLabel = 'Send',
  pendingLabel = 'Saving…',
  busy = false,
  disabled = false,
  readOnly = false,
  voice,
  onStop,
  fieldRef,
  onFocusChange,
}: {
  draft: string;
  onDraftChange: (text: string) => void;
  label: string;
  layout?: 'compact' | 'longform';
  description?: string;
  error?: string;
  placeholder?: string;
  /** Omit for immediate-edit settings; their owner handles each draft change. */
  onSubmit?: (text: string) => void;
  canSubmit?: boolean;
  submitLabel?: string;
  pendingLabel?: string;
  busy?: boolean;
  disabled?: boolean;
  readOnly?: boolean;
  voice?: {
    phase: ComponentProps<typeof VoiceButton>['phase'];
    onClick: () => void;
    disabled?: boolean;
  };
  onStop?: () => void;
  fieldRef?: Ref<HTMLTextAreaElement>;
  onFocusChange?: (focused: boolean) => void;
}) {
  const id = useId();
  const describedBy =
    [description && `${id}-description`, error && `${id}-error`].filter(Boolean).join(' ') ||
    undefined;
  const [focused, setFocused] = useState(false);
  const eligible = !!onSubmit && !!draft.trim() && canSubmit && !busy && !disabled && !readOnly;
  const voiceActive = voice && ['connecting', 'listening', 'finishing'].includes(voice.phase);
  const showVoice = voice && !busy && (voiceActive || !focused);
  useEffect(() => {
    if (busy || disabled) {
      setFocused(false);
      onFocusChange?.(false);
    }
  }, [busy, disabled, onFocusChange]);
  const focus = (value: boolean) => {
    setFocused(value);
    onFocusChange?.(value);
  };
  const field = (
    <InputGroup variant="composer" data-text-box-layout={layout}>
      <InputGroupTextarea
        variant={layout === 'compact' ? 'inline' : 'longform'}
        ref={fieldRef}
        id={id}
        rows={layout === 'compact' ? 1 : 5}
        aria-label={label}
        aria-describedby={describedBy}
        aria-invalid={error ? true : undefined}
        aria-busy={busy || readOnly}
        placeholder={placeholder}
        value={draft}
        disabled={busy || disabled}
        readOnly={readOnly}
        onChange={(event) => onDraftChange(event.currentTarget.value)}
        onFocus={() => focus(true)}
        onKeyDown={(event) => {
          // Safari reports Enter confirming composed text with keyCode 229.
          if (
            event.key === 'Enter' &&
            !event.shiftKey &&
            !event.nativeEvent.isComposing &&
            event.nativeEvent.keyCode !== 229
          ) {
            event.preventDefault();
            if (eligible) event.currentTarget.form?.requestSubmit();
          }
        }}
      />
      {!!(onSubmit || voice) && (
        <InputGroupAddon align="inset-end">
          {voice && showVoice ? (
            <VoiceButton
              phase={voice.phase}
              onClick={voice.onClick}
              disabled={disabled || voice.disabled}
              busy={busy}
              aria-describedby={describedBy}
            />
          ) : busy && onStop ? (
            <SendButton busy={true} onStop={onStop} aria-describedby={describedBy} />
          ) : onSubmit ? (
            layout === 'compact' && !busy ? (
              <SendButton
                focused={voice ? true : focused}
                disabled={!eligible}
                label={submitLabel}
                aria-describedby={describedBy}
              />
            ) : (
              <Button
                type="submit"
                size="standard"
                disabled={!eligible}
                pending={busy}
                aria-describedby={describedBy}
                onPointerDown={(event) => event.preventDefault()}
              >
                {busy ? pendingLabel : submitLabel}
              </Button>
            )
          ) : null}
        </InputGroupAddon>
      )}
    </InputGroup>
  );
  return (
    <Surface
      as="fieldset"
      data-text-box={layout}
      aria-label={`${label} text box`}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) focus(false);
      }}
    >
      <Stack gap="sm">
        {layout === 'longform' && <FieldLabel htmlFor={id}>{label}</FieldLabel>}
        {onSubmit ? (
          <Form
            layout="inline"
            aria-label={label}
            onSubmit={(event) => {
              event.preventDefault();
              if (eligible) onSubmit(draft);
            }}
          >
            {field}
          </Form>
        ) : (
          field
        )}
        {!!description && (
          <Text id={`${id}-description`} size="xs" tone="muted">
            {description}
          </Text>
        )}
        {!!error && <FieldError id={`${id}-error`}>{error}</FieldError>}
      </Stack>
    </Surface>
  );
}
