// Agent compositions: content and actions assembled exclusively from catalogued primitives.
import { createContext, type ReactNode, useContext } from 'react';
import { Stack, Row, Heading, Text, Link, Prose } from './parts/layout.tsx';
import { Button } from './parts/button.tsx';
import { Icon } from './icons.tsx';
import {
  Surface,
  Toolbar,
  ReadingColumn,
  Dock,
  AutoScrollArea,
  AdaptivePanel,
  StatusMark,
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
          <Button variant="ghost" size="square" aria-label="Close" onClick={close}>
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
          <Button variant="ghost" size={mobile ? 'square' : 'sm'} asChild={true}>
            <Link href={historyHref} aria-label="History">
              <Icon name="history" size={mobile ? 'lg' : 'md'} />
              {!mobile && 'History'}
            </Link>
          </Button>
        )}
        <Button
          variant={mobile ? 'ghost' : 'outline'}
          size={mobile ? 'square' : 'sm'}
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
  voiceControl,
  children,
}: ConversationActions & {
  composer: ReactNode;
  suggestions?: ReactNode;
  voiceControl?: ReactNode;
  children: ReactNode;
}) {
  const mobile = useIsMobile();
  const { page } = useContext(ConversationPresentation);
  return (
    <ReadingColumn page={page} label="Conversation">
      <ConversationToolbar historyHref={historyHref} onNewChat={onNewChat} busy={busy} />
      {children}
      <Dock>
        <Stack gap="sm">
          {suggestions}
          <Row data-conversation-input="">
            <Stack grow={true} gap="none">
              {composer}
            </Stack>
            {mobile && voiceControl}
          </Row>
          {!mobile && page && (
            <Text size="xs" tone="subtle" align="end">
              Enter to send · Shift + Enter for a new line
            </Text>
          )}
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
export function Composer({ children }: { children: ReactNode }) {
  return (
    <Surface variant="input" as="fieldset" aria-label="Message composer">
      {children}
    </Surface>
  );
}
export function ComposerActions({ voice, children }: { voice?: ReactNode; children: ReactNode }) {
  return (
    <Row gap="xs">
      <Row visible="expanded" gap="none">
        {voice}
      </Row>
      {children}
    </Row>
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
      : busy
        ? 'Stop agent'
        : recording
          ? 'Finish recording'
          : phase === 'ready'
            ? 'Send transcript'
            : waiting
              ? 'Finishing transcript'
              : 'Start voice interaction';
  return (
    <Button
      type="button"
      variant="voice"
      size="voice"
      pending={waiting}
      aria-label={label}
      aria-pressed={recording}
      disabled={disabled || phase === 'finishing'}
      onClick={onClick}
    >
      <Icon
        name={
          busy || recording ? 'stop' : phase === 'ready' ? 'arrow-up' : waiting ? 'clock' : 'mic'
        }
        size="xl"
      />
    </Button>
  );
}
export function VoiceTranscript({
  phase,
  text,
  error,
  preview,
  onEdit,
  onDiscard,
}: {
  phase: VoicePhase;
  text: string;
  error: string;
  preview?: boolean;
  onEdit: () => void;
  onDiscard: () => void;
}) {
  const active = ['connecting', 'listening', 'finishing'].includes(phase);
  const label =
    phase === 'connecting'
      ? 'Connecting microphone…'
      : phase === 'listening'
        ? 'Listening'
        : phase === 'finishing'
          ? 'Finishing transcript…'
          : phase === 'ready'
            ? 'Ready to send'
            : 'Recording stopped';
  return (
    <Stack as="section" aria-label="Live transcription" gap="lg" block="md">
      <Row>
        <StatusMark active={active} />
        <Text as="span" role="status" size="xs" tone="muted">
          {!!preview && 'Demo · '}
          {label}
        </Text>
      </Row>
      <Text aria-live="polite" aria-atomic={false} size="title" weight="medium" preserve={true}>
        {text || (phase === 'connecting' ? 'Getting ready…' : 'Start speaking…')}
        {phase === 'listening' && <StatusMark active={true} cursor={true} />}
      </Text>
      {!!error && (
        <Text role="alert" size="sm" tone="danger">
          {error}
        </Text>
      )}
      {!active && !!text && (
        <Row>
          <Button variant="outline" size="sm" onClick={onEdit}>
            <Icon name="edit" />
            Edit text
          </Button>
          <Button variant="ghost" size="sm" onClick={onDiscard}>
            Discard
          </Button>
        </Row>
      )}
      {phase === 'ready' && (
        <Text size="sm" tone="muted">
          Tap the arrow to send, or edit your words first.
        </Text>
      )}
    </Stack>
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
      <Heading level={3} tone="subtle">
        Ideas to explore
      </Heading>
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
