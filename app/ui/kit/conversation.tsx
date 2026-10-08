// A single conversation state can be presented as a phone screen or a desktop reading column.
import { createContext, type ReactNode, useContext, useEffect, useRef } from 'react';
import { FocusScope } from '@radix-ui/react-focus-scope';
import { hideOthers } from 'aria-hidden';
import { StickToBottom, useStickToBottomContext } from 'use-stick-to-bottom';
import { Button } from './parts/button.tsx';
import { Icon } from './icons.tsx';
import { cn } from './lib/utils.ts';
import { useIsMobile } from './hooks/use-mobile.ts';
import { useLayout } from './hooks/use-layout.ts';
import { useRestoreFocus } from './hooks/use-restore-focus.ts';

// Layout can change without moving conversation state into either device's presentation.
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
  return mobile ? (
    <div className="flex flex-col items-center gap-3 px-2 py-6 text-center">
      <span className="mb-1 flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Icon name="sparkles" size="lg" />
      </span>
      <h1 className="m-0 max-w-[18ch] font-serif text-display font-medium">{title}</h1>
      <p className="m-0 max-w-[34ch] text-copy text-muted-foreground">{description}</p>
    </div>
  ) : (
    <div className="flex flex-col gap-6 py-4">
      <h1 className={cn('m-0 font-serif font-medium', page ? 'text-display' : 'text-title')}>
        {title}
      </h1>
      <p className="m-0 text-copy text-muted-foreground">{description}</p>
    </div>
  );
}

interface ConversationActions {
  historyHref?: string;
  onNewChat: () => void;
  busy: boolean;
}

function MobileConversationToolbar({ historyHref, onNewChat, busy }: ConversationActions) {
  const { page, close } = useContext(ConversationPresentation);
  return (
    <header className="flex h-12 shrink-0 items-center justify-between border-b px-3">
      <div className="flex items-center gap-1">
        {!!close && (
          <Button
            variant="ghost"
            size="icon-lg"
            className="size-11 rounded-none"
            aria-label="Close"
            onClick={close}
          >
            <Icon name="arrow-left" size="lg" />
          </Button>
        )}
        <h2 className="m-0 px-1 text-sm font-semibold">
          {page || close ? 'Agent' : 'Conversation'}
        </h2>
      </div>
      <div className="flex items-center">
        {!!historyHref && (
          <Button variant="ghost" size="icon-lg" className="size-11 rounded-none" asChild={true}>
            <a href={historyHref} aria-label="History" onClick={close}>
              <Icon name="history" size="lg" />
            </a>
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon-lg"
          className="size-11 rounded-none"
          aria-label="New chat"
          disabled={busy}
          onClick={onNewChat}
        >
          <Icon name="plus" size="lg" />
        </Button>
      </div>
    </header>
  );
}

function DesktopConversationToolbar({ historyHref, onNewChat, busy }: ConversationActions) {
  const { page, close } = useContext(ConversationPresentation);
  return (
    <header className="flex shrink-0 items-center justify-between gap-3">
      {!!(page || close) && (
        <div className="flex flex-col gap-1">
          <h2 className="m-0 text-copy font-semibold">Agent</h2>
          <p className="m-0 text-label text-subtle-foreground">Your vault, in conversation</p>
        </div>
      )}
      <div className={cn('flex items-center gap-2', !page && 'w-full justify-between')}>
        {!!historyHref && (
          <Button variant="ghost" size="sm" asChild={true}>
            <a href={historyHref} onClick={close}>
              <Icon name="history" />
              History
            </a>
          </Button>
        )}
        <Button variant="outline" size="sm" disabled={busy} onClick={onNewChat}>
          <Icon name="plus" />
          New chat
        </Button>
        {!!close && (
          <Button variant="ghost" size="icon-sm" aria-label="Close panel" onClick={close}>
            <Icon name="close" />
          </Button>
        )}
      </div>
    </header>
  );
}

/** Device-specific toolbar and composer dock; the feed and draft have a stable place on resize. */
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
  const actions = { historyHref, onNewChat, busy };
  return (
    <section
      aria-label="Conversation"
      data-layout={mobile ? 'mobile-conversation' : 'desktop-conversation'}
      className={cn(
        'flex min-h-0 min-w-0 flex-1 flex-col',
        !mobile && page && 'px-[var(--page-inset)] pt-[var(--page-block)] pb-4',
      )}
    >
      <div
        data-reading-column={page ? '' : undefined}
        className={cn(
          'flex min-h-0 min-w-0 flex-1 flex-col',
          !mobile && page && 'mx-auto w-full max-w-[var(--reading-width)]',
        )}
      >
        {mobile ? (
          <MobileConversationToolbar {...actions} />
        ) : (
          <DesktopConversationToolbar {...actions} />
        )}
        {children}
        <div className={mobile ? 'shrink-0 border-t bg-surface px-4 py-3' : 'shrink-0 pt-3'}>
          {suggestions}
          <div data-conversation-input="" className="flex min-w-0 items-center gap-2">
            <div className="min-w-0 flex-1">{composer}</div>
            {mobile && voiceControl}
          </div>
          {!mobile && page && (
            <p className="mt-2 mb-0 text-right text-caption text-subtle-foreground">
              Enter to send · Shift + Enter for a new line
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

export function ConversationFeed({ empty, children }: { empty?: boolean; children: ReactNode }) {
  const mobile = useIsMobile();
  return (
    <StickToBottom
      className="relative min-h-0 flex-1 overflow-y-auto"
      initial="smooth"
      resize="smooth"
    >
      <StickToBottom.Content
        // The library reserves a scrollbar gutter on both edges, which indents the feed past the
        // toolbar and composer wherever scrollbars take space; one edge keeps the left edges aligned.
        scrollClassName="[scrollbar-gutter:stable]!"
        className={cn(
          'flex flex-col',
          mobile ? 'gap-4 px-4 py-4' : 'gap-6 px-1 py-7',
          mobile && empty && 'min-h-full justify-center',
        )}
      >
        {children}
      </StickToBottom.Content>
      <ScrollDown />
    </StickToBottom>
  );
}
function ScrollDown() {
  const { isAtBottom, scrollToBottom } = useStickToBottomContext();
  if (isAtBottom) return null;
  return (
    <Button
      className="absolute right-3 bottom-3 rounded-full"
      variant="outline"
      size="sm"
      onClick={() => {
        void scrollToBottom();
      }}
    >
      Latest reply
    </Button>
  );
}

export function Message({ user, children }: { user?: boolean; children: ReactNode }) {
  const mobile = useIsMobile();
  return (
    <div
      data-message={user ? 'user' : 'agent'}
      className={cn('flex min-w-0 flex-col', user ? 'ml-auto max-w-[85%] items-end' : 'gap-2')}
    >
      {!mobile && (
        <span className="text-caption font-medium text-subtle-foreground">
          {user ? 'You' : 'Agent'}
        </span>
      )}
      <div
        className={cn(
          user ? 'whitespace-pre-wrap bg-muted text-body' : 'flex min-w-0 flex-col gap-3',
          user && (mobile ? 'rounded-2xl px-3 py-2.5 text-copy' : 'mt-1 rounded-2xl px-4 py-3'),
        )}
      >
        {children}
      </div>
    </div>
  );
}
export function Markdown({ children }: { children: ReactNode }) {
  return <div className="prose font-serif text-lead">{children}</div>;
}
export function Composer({ children }: { children: ReactNode }) {
  return (
    <fieldset
      aria-label="Message composer"
      className={cn(
        'min-w-0 shrink-0 border bg-background p-1 shadow-xs focus-within:ring-2 focus-within:ring-ring/50 [&_form]:flex [&_form]:min-w-0 [&_form]:items-center [&_textarea]:h-11 [&_textarea]:min-h-11 [&_textarea]:min-w-0 [&_textarea]:flex-1 [&_textarea]:field-sizing-fixed [&_textarea]:resize-none [&_textarea]:border-0 [&_textarea]:bg-transparent [&_textarea]:px-3 [&_textarea]:py-3 [&_textarea]:leading-5 [&_textarea]:placeholder:text-subtle-foreground [&_textarea]:placeholder:text-sm [&_textarea]:shadow-none [&_textarea]:focus-visible:ring-0',
        'rounded-2xl [&_textarea]:rounded-xl',
      )}
    >
      {children}
    </fieldset>
  );
}
export function ComposerActions({ voice, children }: { voice?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex shrink-0 items-center gap-1">
      <div className="hidden md:contents">{voice}</div>
      {children}
    </div>
  );
}
/** An agent sheet on phones, a reading panel or dialog on desktop. */
export function ConversationPanel({
  open,
  onClose,
  children,
}: {
  open: boolean;
  onClose: () => void;
  children?: ReactNode;
}) {
  const layout = useLayout();
  const mobile = layout === 'compact';
  const wide = layout === 'wide';
  const ref = useRef<HTMLDivElement>(null);
  const restoreFocus = useRestoreFocus(open);
  useEffect(() => {
    if (!open) return;
    const dismissOnEscape = (event: KeyboardEvent) => {
      if (
        event.key === 'Escape' &&
        !event.defaultPrevented &&
        !document.querySelector('[data-slot="dialog-content"], [data-slot="drawer-content"]')
      )
        onClose();
    };
    document.addEventListener('keydown', dismissOnEscape);
    return () => document.removeEventListener('keydown', dismissOnEscape);
  }, [open, onClose]);
  useEffect(() => {
    if (!open || wide || !ref.current) return;
    const restoreAria = hideOthers(ref.current);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    if (!ref.current.contains(document.activeElement))
      ref.current.querySelector<HTMLElement>('button, a, textarea')?.focus();
    return () => {
      restoreAria();
      document.body.style.overflow = previous;
    };
  }, [open, wide]);
  if (!open) return null;
  return (
    <>
      {!wide && (
        <div
          aria-hidden={true}
          onPointerDown={onClose}
          className="fixed inset-0 z-40 bg-black/50"
        />
      )}
      <FocusScope asChild={true} trapped={!wide} loop={!wide} onUnmountAutoFocus={restoreFocus}>
        {/* biome-ignore lint/a11y/useAriaPropsSupportedByRole: role and modal semantics adapt together; both roles support a label. */}
        <div
          ref={ref}
          role={wide ? 'complementary' : 'dialog'}
          aria-label="Agent"
          aria-modal={wide ? undefined : true}
          className={cn(
            'flex min-h-0 flex-col bg-background outline-none',
            wide
              ? 'h-dvh w-[26rem] shrink-0 gap-3 border-l p-5'
              : mobile
                ? 'fixed inset-x-0 top-[var(--viewport-top,0px)] z-50 h-[var(--viewport-height,100dvh)] pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]'
                : 'fixed top-1/2 left-1/2 z-50 h-[80dvh] max-h-[90dvh] w-[min(32rem,calc(100%-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-lg border p-5 shadow-lg',
          )}
        >
          <ConversationPresentation.Provider value={{ page: false, close: onClose }}>
            {children}
          </ConversationPresentation.Provider>
        </div>
      </FocusScope>
    </>
  );
}

/** Voice input is the primary phone interaction; no label is placed under the circle. */
export function VoiceButton({
  phase,
  busy,
  disabled,
  onClick,
}: {
  phase: 'idle' | 'connecting' | 'listening' | 'finishing' | 'ready' | 'error';
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
    <button
      type="button"
      aria-label={label}
      aria-pressed={recording}
      disabled={disabled || phase === 'finishing'}
      onClick={onClick}
      className={cn(
        'flex size-16 items-center justify-center rounded-full border-4 border-background bg-primary text-primary-foreground shadow-lg focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-60',
        recording && 'bg-destructive',
        waiting && 'animate-pulse',
      )}
    >
      <Icon
        name={
          busy || recording ? 'stop' : phase === 'ready' ? 'arrow-up' : waiting ? 'clock' : 'mic'
        }
        size="xl"
      />
    </button>
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
  phase: 'idle' | 'connecting' | 'listening' | 'finishing' | 'ready' | 'error';
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
    <section aria-label="Live transcription" className="flex min-w-0 flex-col gap-5 py-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span
          className={cn(
            'size-2 rounded-full',
            active ? 'animate-pulse bg-destructive' : 'bg-subtle-foreground',
          )}
        />
        <span role="status">
          {!!preview && 'Demo · '}
          {label}
        </span>
      </div>
      <p
        aria-live="polite"
        aria-atomic={false}
        className="m-0 whitespace-pre-wrap break-words text-title leading-relaxed font-medium tracking-tight"
      >
        {text || (phase === 'connecting' ? 'Getting ready…' : 'Start speaking…')}
        {phase === 'listening' && (
          <span
            aria-hidden={true}
            className="ml-1 inline-block h-5 w-0.5 animate-pulse bg-primary align-middle"
          />
        )}
      </p>
      {!!error && (
        <p role="alert" className="m-0 text-label leading-relaxed text-destructive">
          {error}
        </p>
      )}
      {!active && !!text && (
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onEdit}>
            <Icon name="edit" />
            Edit text
          </Button>
          <Button variant="ghost" size="sm" onClick={onDiscard}>
            Discard
          </Button>
        </div>
      )}
      {phase === 'ready' && (
        <p className="m-0 text-label text-muted-foreground">
          Tap the arrow to send, or edit your words first.
        </p>
      )}
    </section>
  );
}

export function PromptSuggestions({
  suggestions,
  onSelect,
}: {
  suggestions: string[];
  onSelect: (text: string) => void;
}) {
  const mobile = useIsMobile();
  if (!suggestions.length) return null;
  return (
    <section aria-label="Suggested prompts" className="mb-4 flex flex-col gap-2">
      <h3 className="m-0 text-caption font-medium text-subtle-foreground">Ideas to explore</h3>
      <div className={mobile ? 'flex gap-2 overflow-x-auto pb-1' : 'flex flex-wrap gap-2'}>
        {suggestions.map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            data-touch-target=""
            onClick={() => onSelect(suggestion)}
            className={cn(
              'border bg-background px-3 py-2 text-left text-label leading-snug text-muted-foreground hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring',
              mobile ? 'min-h-16 w-52 shrink-0 rounded-lg' : 'max-w-64 rounded-lg',
            )}
          >
            {suggestion}
          </button>
        ))}
      </div>
    </section>
  );
}
