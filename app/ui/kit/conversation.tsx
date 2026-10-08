// A single conversation state can be presented as a phone screen or a desktop reading column.
import { createContext, type ReactNode, useContext } from 'react';
import { StickToBottom, useStickToBottomContext } from 'use-stick-to-bottom';
import { Button } from './parts/button.tsx';
import { Dialog, DialogContent, DialogTitle } from './parts/dialog.tsx';
import { Icon } from './icons.tsx';
import { cn } from './lib/utils.ts';
import { useIsMobile } from './hooks/use-mobile.ts';
import { Overlay } from './app.tsx';
import { SidePanel } from './surfaces.tsx';

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
      <h1 className="m-0 max-w-[16ch] font-serif text-[24px] leading-[1.2] font-medium tracking-[-0.01em]">
        {title}
      </h1>
      <p className="m-0 max-w-[32ch] text-[13px] leading-relaxed text-muted-foreground">
        {description}
      </p>
    </div>
  ) : (
    <div className="flex flex-col gap-6 py-4">
      <h1
        className={cn(
          'm-0 font-serif leading-[1.15] font-medium tracking-[-0.01em]',
          page ? 'text-[40px]' : 'text-[26px]',
        )}
      >
        {title}
      </h1>
      <p className="m-0 text-[15px] text-muted-foreground">{description}</p>
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
      {!!page && (
        <div className="flex flex-col gap-1">
          <h2 className="m-0 text-[15px] font-semibold">Agent</h2>
          <p className="m-0 text-[13px] text-subtle-foreground">Your vault, in conversation</p>
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
  children,
}: ConversationActions & { composer: ReactNode; children: ReactNode }) {
  const mobile = useIsMobile();
  const { page } = useContext(ConversationPresentation);
  const actions = { historyHref, onNewChat, busy };
  return (
    <section
      aria-label="Conversation"
      data-layout={mobile ? 'mobile-conversation' : 'desktop-conversation'}
      className={cn('flex min-h-0 min-w-0 flex-1 flex-col', !mobile && page && 'px-12 pt-9 pb-4')}
    >
      <div
        className={cn(
          'flex min-h-0 min-w-0 flex-1 flex-col',
          !mobile && page && 'w-full max-w-3xl',
        )}
      >
        {mobile ? (
          <MobileConversationToolbar {...actions} />
        ) : (
          <DesktopConversationToolbar {...actions} />
        )}
        {children}
        <div className={mobile ? 'shrink-0 border-t bg-surface px-3 pt-2 pb-3' : 'shrink-0 pt-3'}>
          {composer}
          {!mobile && page && (
            <p className="mt-2 mb-0 text-right text-[11px] text-subtle-foreground">
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
        <span className="text-[11px] font-medium text-subtle-foreground">
          {user ? 'You' : 'Agent'}
        </span>
      )}
      <div
        className={cn(
          user ? 'whitespace-pre-wrap bg-muted text-body' : 'flex min-w-0 flex-col gap-3',
          user && (mobile ? 'rounded-xl px-3 py-2.5 text-[15px]' : 'mt-1 rounded-2xl px-4 py-3'),
        )}
      >
        {children}
      </div>
    </div>
  );
}
export function Markdown({ children }: { children: ReactNode }) {
  return (
    <div className="prose font-serif text-[17px] leading-relaxed md:text-[19px]">{children}</div>
  );
}
export function Composer({ children }: { children: ReactNode }) {
  const mobile = useIsMobile();
  return (
    <fieldset
      aria-label="Message composer"
      className={cn(
        'relative min-w-0 shrink-0 border bg-background p-1 shadow-xs focus-within:ring-2 focus-within:ring-ring/50 [&_textarea]:max-h-64 [&_textarea]:resize-none [&_textarea]:border-0 [&_textarea]:bg-transparent [&_textarea]:px-3 [&_textarea]:pt-3 [&_textarea]:placeholder:text-subtle-foreground [&_textarea]:placeholder:text-sm [&_textarea]:shadow-none [&_textarea]:focus-visible:ring-0',
        mobile ? 'rounded-xl [&_textarea]:rounded-lg' : 'rounded-2xl [&_textarea]:rounded-xl',
        mobile
          ? '[&_textarea]:min-h-28 [&_textarea]:pb-12'
          : '[&_textarea]:min-h-32 [&_textarea]:pb-16',
      )}
    >
      {children}
    </fieldset>
  );
}
export function ComposerActions({ children }: { children: ReactNode }) {
  return <div className="absolute right-2 bottom-2 flex items-center gap-1">{children}</div>;
}
/** An agent sheet on phones, a reading panel or dialog on desktop. */
export function ConversationPanel({
  mobile,
  wide,
  open,
  onClose,
  children,
}: {
  mobile: boolean;
  wide: boolean;
  open: boolean;
  onClose: () => void;
  children?: ReactNode;
}) {
  if (mobile)
    return (
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next) onClose();
        }}
      >
        <DialogContent
          showCloseButton={false}
          aria-describedby={undefined}
          className="inset-0 flex h-dvh max-h-none w-full max-w-none translate-x-0 translate-y-0 flex-col gap-0 rounded-none border-0 p-0 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] sm:max-w-none"
        >
          <DialogTitle className="sr-only">Ask the agent</DialogTitle>
          <ConversationPresentation.Provider value={{ page: false, close: onClose }}>
            {children}
          </ConversationPresentation.Provider>
        </DialogContent>
      </Dialog>
    );
  if (wide)
    return open ? (
      <SidePanel title="Agent" onClose={onClose}>
        <ConversationPresentation.Provider value={{ page: false, close: onClose }}>
          {children}
        </ConversationPresentation.Provider>
      </SidePanel>
    ) : null;
  return (
    <Overlay mobile={false} open={open} onClose={onClose} title="Ask the agent" tall={true}>
      <ConversationPresentation.Provider value={{ page: false, close: onClose }}>
        {children}
      </ConversationPresentation.Provider>
    </Overlay>
  );
}
