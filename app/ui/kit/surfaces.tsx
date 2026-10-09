import { usePresentationPolicy } from './presentation-policy.tsx';
// Shared gates, notices, tool results and diffs. No vault or workflow logic.
import { type ReactNode, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Button } from './parts/button.tsx';
import { Icon } from './icons.tsx';
import { cn } from './lib/utils.ts';
import { useIsMobile } from './hooks/use-mobile.ts';

export function Gate({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-svh max-w-md flex-col justify-center gap-6 px-5 py-12">
      {children}
    </main>
  );
}

export function PreviewBar({
  label,
  kitHref,
  onReset,
  controls,
}: {
  label: string;
  kitHref: string;
  onReset: () => void;
  controls?: ReactNode;
}) {
  const mobile = useIsMobile();
  return (
    <aside
      aria-label="Design preview"
      className="flex min-h-9 shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b bg-card px-4 py-1 text-foreground"
    >
      <span className="min-w-0 truncate text-caption text-muted-foreground">
        {mobile ? 'Sample preview' : `${label} · Sample data · Scripted chat`}
      </span>
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        {controls}
        <a
          data-touch-target=""
          href={kitHref}
          aria-label="Component kit"
          className="flex min-h-9 items-center gap-1 px-2 text-xs text-link hover:underline"
        >
          <Icon name="extension" size="sm" />
          {mobile ? 'Kit' : 'Component kit'}
        </a>
        <Button variant="ghost" size="sm" aria-label="Reset demo" onClick={onReset}>
          {mobile ? <Icon name="undo" size="sm" /> : 'Reset demo'}
        </Button>
      </div>
    </aside>
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
    <details className="overflow-hidden rounded-xl border bg-surface text-label">
      <summary
        data-touch-target=""
        className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5"
      >
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
  const policy = usePresentationPolicy();
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const position = () => {
      const bounds = policy.bounds();
      const originLeft = policy.bounded ? bounds.left : 0;
      const originTop = policy.bounded ? bounds.top : 0;
      const left = anchor.left - originLeft;
      const top = anchor.top - originTop;
      const bottom = anchor.bottom - originTop;
      const minLeft = bounds.left - originLeft + 8;
      const minTop = bounds.top - originTop + 8;
      const maxLeft = bounds.right - originLeft - el.offsetWidth - 8;
      const maxTop = bounds.bottom - originTop - el.offsetHeight - 8;
      el.style.left = `${Math.max(minLeft, Math.min(left, maxLeft))}px`;
      el.style.top = `${bottom + 8 > maxTop ? Math.max(minTop, top - el.offsetHeight - 8) : bottom + 8}px`;
    };
    position();
    return policy.watchBounds(position);
  }, [anchor, policy]);
  const content = (
    <div
      ref={ref}
      role="tooltip"
      className="pointer-events-none fixed z-50 max-w-sm rounded-xl border bg-popover p-3 text-sm shadow-lg"
    >
      <strong>{title}</strong>
      {!!text && <p className="mt-1 mb-0 text-muted-foreground">{text}</p>}
    </div>
  );
  return policy.portal ? createPortal(content, policy.portal) : content;
}
