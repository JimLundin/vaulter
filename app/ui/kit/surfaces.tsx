// Shared presentation for conversations, overlays and change history. No vault or workflow logic.
import { type ReactNode, useEffect, useRef } from 'react';
import { StickToBottom, useStickToBottomContext } from 'use-stick-to-bottom';
import { Button } from './parts/button.tsx';
import { Icon } from './icons.tsx';
import { cn } from './lib/utils.ts';

export function Gate({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-svh max-w-md flex-col justify-center gap-6 px-5 py-12">
      {children}
    </main>
  );
}

export function PreviewBar({ children }: { children: ReactNode }) {
  return (
    <aside
      aria-label="Design preview"
      className="flex min-h-10 flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b bg-card px-4 py-1 text-foreground"
    >
      {children}
    </aside>
  );
}

export function ConversationSurface({ page, children }: { page?: boolean; children: ReactNode }) {
  return (
    <section
      aria-label="Conversation"
      className={cn(
        'flex min-h-0 flex-col',
        page ? 'h-[calc(100dvh-16rem)] min-h-80 shrink-0 md:h-[calc(100svh-12rem)]' : 'flex-1',
      )}
    >
      {children}
    </section>
  );
}

export function ConversationFeed({ children }: { children: ReactNode }) {
  return (
    <StickToBottom
      className="relative min-h-0 flex-1 overflow-y-auto"
      initial="smooth"
      resize="smooth"
    >
      <StickToBottom.Content className="flex flex-col gap-6 px-1 py-5">
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
  return (
    <div
      className={
        user
          ? 'ml-auto max-w-[85%] whitespace-pre-wrap rounded-2xl bg-muted px-4 py-3 text-body'
          : 'flex min-w-0 flex-col gap-3'
      }
    >
      {children}
    </div>
  );
}
export function Markdown({ children }: { children: ReactNode }) {
  return (
    <div className="prose font-serif text-[17px] leading-relaxed md:text-[19px]">{children}</div>
  );
}
export function Activity({ busy, label }: { busy: boolean; label: string }) {
  return (
    <span
      role="status"
      aria-label={label}
      className={cn(
        'inline-block size-2 shrink-0 rounded-full bg-places',
        busy && 'animate-pulse bg-events',
      )}
    />
  );
}
export function ToolResult({
  title,
  status,
  error,
  input,
  output,
}: {
  title: string;
  status?: string;
  error?: boolean;
  input: unknown;
  output?: ReactNode;
}) {
  return (
    <details className="overflow-hidden rounded-xl border bg-surface text-[13px]">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5">
        <Icon name={error ? 'warning' : status ? 'check' : 'clock'} size="sm" />
        <span className="min-w-0 flex-1 truncate font-medium">{title}</span>
        {!!status && (
          <span
            className={cn(
              'max-w-[45%] truncate text-xs text-muted-foreground',
              error && 'text-destructive',
            )}
          >
            {status}
          </span>
        )}
      </summary>
      <div className="flex flex-col gap-3 border-t px-3 py-3">
        <pre className="m-0 max-h-64 overflow-auto whitespace-pre-wrap break-words font-mono text-xs text-muted-foreground">
          {JSON.stringify(input, null, 2)}
        </pre>
        {output}
      </div>
    </details>
  );
}
export function Json({ value }: { value: unknown }) {
  return (
    <pre className="m-0 max-h-64 overflow-auto whitespace-pre-wrap break-words font-mono text-xs">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}
export function Composer({ children }: { children: ReactNode }) {
  return (
    <fieldset
      aria-label="Message composer"
      className="relative mt-3 min-w-0 shrink-0 rounded-2xl border bg-background p-1 shadow-xs focus-within:ring-2 focus-within:ring-ring/50 [&_textarea]:max-h-64 [&_textarea]:min-h-32 [&_textarea]:resize-none [&_textarea]:rounded-xl [&_textarea]:border-0 [&_textarea]:bg-transparent [&_textarea]:px-3 [&_textarea]:pt-3 [&_textarea]:pb-16 [&_textarea]:shadow-none [&_textarea]:focus-visible:ring-0"
    >
      {children}
    </fieldset>
  );
}
export function ComposerActions({ children }: { children: ReactNode }) {
  return <div className="absolute right-2 bottom-2 flex items-center gap-1">{children}</div>;
}
export function SidePanel({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <aside
      aria-label={title}
      className="flex h-svh w-[26rem] shrink-0 flex-col gap-3 border-l bg-background p-5"
    >
      <div className="flex items-center justify-between">
        <h2 className="m-0 text-sm font-semibold">{title}</h2>
        <Button variant="ghost" size="icon-sm" aria-label="Close panel" onClick={onClose}>
          <Icon name="close" />
        </Button>
      </div>
      {children}
    </aside>
  );
}
export function UnifiedDiff({ path, patch }: { path: string; patch?: string }) {
  return (
    <div className="overflow-hidden rounded-xl border">
      <div className="border-b bg-surface px-3 py-2 font-mono text-xs">{path}</div>
      {patch === undefined ? (
        <p className="px-3 text-sm text-muted-foreground">No text diff available.</p>
      ) : (
        <pre className="m-0 overflow-x-auto py-2 font-mono text-xs leading-relaxed">
          {patch.split('\n').map((line, i) => (
            <div
              // biome-ignore lint/suspicious/noArrayIndexKey: a patch line is its position
              key={i}
              className={cn(
                'min-h-[1lh] whitespace-pre-wrap break-words px-3',
                line.startsWith('+') && 'bg-added text-added-ink',
                line.startsWith('-') && 'bg-removed text-removed-ink',
                line.startsWith('@@') && 'bg-surface text-subtle-foreground',
              )}
            >
              {line}
            </div>
          ))}
        </pre>
      )}
    </div>
  );
}
export function HoverPreview({
  title,
  text,
  anchor,
}: {
  title: string;
  text?: string;
  anchor: DOMRect;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.left = `${Math.max(8, Math.min(anchor.left, innerWidth - el.offsetWidth - 8))}px`;
    el.style.top = `${anchor.bottom + el.offsetHeight + 16 > innerHeight ? Math.max(8, anchor.top - el.offsetHeight - 8) : anchor.bottom + 8}px`;
  }, [anchor]);
  return (
    <div
      ref={ref}
      role="tooltip"
      className="pointer-events-none fixed z-50 max-w-sm rounded-xl border bg-popover p-3 text-sm shadow-lg"
    >
      <strong>{title}</strong>
      {!!text && <p className="mt-1 mb-0 text-muted-foreground">{text}</p>}
    </div>
  );
}
