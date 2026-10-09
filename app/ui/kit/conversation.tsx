// Agent compositions: content and actions assembled exclusively from catalogued primitives.
import { createContext, type ReactNode, type Ref, useContext, useState } from 'react';
import { Stack, Row, Heading, Text, Link, Prose } from './parts/layout.tsx';
import { Form } from './app.tsx';
import { Button } from './parts/button.tsx';
import { InputGroup, InputGroupAddon, InputGroupTextarea } from './parts/input-group.tsx';
import { Icon } from './icons.tsx';
import {
  Surface,
  Toolbar,
  ReadingColumn,
  Dock,
  AutoScrollArea,
  AdaptivePanel,
  OptionStrip,
} from './primitives.tsx';
import { useIsMobile } from './hooks/use-mobile.ts';

const ConversationPresentation = createContext<{ page: boolean; close?: () => void }>({
  page: false,
});

export function ConversationPage({ children }: { children: ReactNode }) {
  return (
    <ConversationPresentation.Provider value={{ page: true }}>
      {children}
    </ConversationPresentation.Provider>
  );
}

export function ConversationWelcome({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  const mobile = useIsMobile();
  const { page } = useContext(ConversationPresentation);
  return (
    <Stack
      gap={mobile ? 'md' : 'xl'}
      align={mobile ? 'center' : 'stretch'}
      inset={mobile ? 'sm' : 'none'}
      block={mobile ? 'lg' : 'md'}
      centerText={mobile}
    >
      {mobile && (
        <Surface variant="emblem">
          <Icon name="sparkles" size="lg" />
        </Surface>
      )}
      <Heading
        level={page || mobile ? 1 : 2}
        serif={true}
        size={page || mobile ? 'display' : 'title'}
      >
        {title}
      </Heading>
      <Text tone="muted">{description}</Text>
    </Stack>
  );
}

interface ConversationActions {
  historyHref?: string;
  onNewChat: () => void;
  busy: boolean;
}
function ConversationToolbar({ historyHref, onNewChat, busy }: ConversationActions) {
  const mobile = useIsMobile();
  const { page, close } = useContext(ConversationPresentation);
  return (
    <Toolbar>
      <Row gap="xs">
        {mobile && !!close && (
          <Button variant="ghost" size="icon-lg" aria-label="Close" onClick={close}>
            <Icon name="arrow-left" size="lg" />
          </Button>
        )}
        {(mobile || page || !!close) && (
          <Stack gap="xs">
            <Heading level={2}>{page || close ? 'Agent' : 'Conversation'}</Heading>
            {!mobile && (
              <Text size="sm" tone="subtle">
                Your vault, in conversation
              </Text>
            )}
          </Stack>
        )}
      </Row>
      <Row>
        {!!historyHref && (
          <Button
            variant="ghost"
            size={mobile ? 'icon-lg' : 'sm'}
            nativeButton={false}
            render={<Link href={historyHref} aria-label="History" plain={true} />}
          >
            <Icon name="history" size={mobile ? 'lg' : 'md'} />
            {!mobile && 'History'}
          </Button>
        )}
        <Button
          variant="default"
          size={mobile ? 'icon-lg' : 'sm'}
          aria-label="New chat"
          disabled={busy}
          onClick={onNewChat}
        >
          <Icon name="plus" size={mobile ? 'lg' : 'md'} />
          {!mobile && 'New chat'}
        </Button>
        {!mobile && !!close && (
          <Button variant="ghost" size="icon-sm" aria-label="Close panel" onClick={close}>
            <Icon name="close" />
          </Button>
        )}
      </Row>
    </Toolbar>
  );
}

/** The feed and draft keep a stable position while the toolbar and dock rearrange. */
export function ConversationSurface({
  historyHref,
  onNewChat,
  busy,
  composer,
  suggestions,
  status,
  children,
}: ConversationActions & {
  composer: ReactNode;
  suggestions?: ReactNode;
  status?: ReactNode;
  children: ReactNode;
}) {
  const { page } = useContext(ConversationPresentation);
  return (
    <ReadingColumn page={page} label="Conversation">
      <ConversationToolbar historyHref={historyHref} onNewChat={onNewChat} busy={busy} />
      {children}
      <Dock status={status}>
        <Stack gap="sm">
          {suggestions}
          <Row data-conversation-input="">
            <Stack grow={true} gap="none">
              {composer}
            </Stack>
          </Row>
        </Stack>
      </Dock>
    </ReadingColumn>
  );
}

export function ConversationFeed({ empty, children }: { empty?: boolean; children: ReactNode }) {
  return <AutoScrollArea empty={empty}>{children}</AutoScrollArea>;
}
export function Message({ user, children }: { user?: boolean; children: ReactNode }) {
  const mobile = useIsMobile();
  return (
    <Stack data-message={user ? 'user' : 'agent'} align={user ? 'end' : 'stretch'} gap="sm">
      {!mobile && (
        <Text as="span" size="xs" weight="medium" tone="subtle">
          {user ? 'You' : 'Agent'}
        </Text>
      )}
      {user ? <Surface variant="bubble">{children}</Surface> : <Stack>{children}</Stack>}
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
            {!!voice && (
              <VoiceButton
                phase={voice.phase}
                onClick={voice.onClick}
                disabled={voice.disabled}
                busy={busy}
              />
            )}
            <SendButton
              busy={busy}
              focused={focused}
              disabled={!eligible}
              onStop={onStop}
              label={sendLabel}
            />
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
      variant={busy ? 'outline' : 'default'}
      size="icon-lg"
      aria-label={busy ? 'Stop' : label}
      disabled={!busy && disabled}
      onClick={busy ? onStop : undefined}
    >
      <Icon name={busy ? 'stop' : focused ? 'enter' : 'arrow-up'} />
    </Button>
  );
}
export function ConversationPanel({
  open,
  onClose,
  children,
}: {
  open: boolean;
  onClose: () => void;
  children?: ReactNode;
}) {
  return (
    <AdaptivePanel open={open} onClose={onClose} title="Agent">
      <ConversationPresentation.Provider value={{ page: false, close: onClose }}>
        {children}
      </ConversationPresentation.Provider>
    </AdaptivePanel>
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
      variant="ghost"
      size="icon-lg"
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
            variant="suggestion"
            onClick={() => onSelect(suggestion)}
          >
            {suggestion}
          </Button>
        ))}
      </OptionStrip>
    </Stack>
  );
}
