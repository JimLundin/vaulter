import { usePresentationPolicy } from './presentation-policy.tsx';
// Shared gates, notices, tool results and diffs. No vault or workflow logic.
import { type ReactNode, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { LoaderCircle } from 'lucide-react';
import { Button } from './parts/button.tsx';
import { Icon } from './icons.tsx';
import { cn } from './lib/utils.ts';
import { useLayout } from './hooks/use-layout.ts';

export function Gate({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-svh max-w-md flex-col justify-center gap-6 px-5 py-12">
      {children}
    </main>
  );
}

export function LoadingStatus({ children = 'Loading…' }: { children?: ReactNode }) {
  return (
    <div role="status" className="kit-loading-status">
      <LoaderCircle aria-hidden="true" className="kit-loading-spinner" />
      <span>{children}</span>
    </div>
  );
}

/** A content-area placeholder, usable directly or as a Suspense fallback. */
export function Loader({ children = 'Loading…' }: { children?: ReactNode }) {
  return (
    <div className="kit-loader">
      <LoadingStatus>{children}</LoadingStatus>
    </div>
  );
}

export function PreviewBar({
  label,
  chat = 'Scripted chat',
  kitHref,
  onReset,
  controls,
}: {
  label: string;
  chat?: 'Scripted chat' | 'Live agent';
  kitHref: string;
  onReset: () => void;
  controls?: ReactNode;
}) {
  const mobile = useLayout() === 'compact';
  const [expanded, setExpanded] = useState(false);
  const ref = useRef<HTMLElement>(null);
  const controlsId = useId();
  useEffect(() => {
    if (!(mobile && expanded)) return;
    const dismiss = (event: PointerEvent) => {
      if (event.target instanceof Node && !ref.current?.contains(event.target)) setExpanded(false);
    };
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, [mobile, expanded]);
  return (
    <aside
      ref={ref}
      aria-label="Design preview"
      title={`${label} · Sample data · ${chat}`}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && expanded) {
          event.stopPropagation();
          setExpanded(false);
          event.currentTarget.querySelector<HTMLButtonElement>('[aria-expanded]')?.focus();
        }
      }}
      className={cn(
        'kit-preview-bar pointer-events-auto flex max-w-full shrink-0 items-center gap-1 border p-1 text-foreground',
        mobile ? 'flex-col rounded-[28px]' : 'rounded-full',
      )}
    >
      <span className="sr-only">
        {label} · Sample data · {chat}
      </span>
      <div className={cn('flex items-center gap-1', mobile && 'w-full justify-between')}>
        <Button
          variant="ghost"
          size={mobile ? 'standard' : 'compact'}
          iconOnly={true}
          aria-label="Move preview controls"
          data-preview-drag-handle=""
          title="Drag to move. Arrow keys move; Home returns to the top."
          className="kit-preview-handle rounded-full text-zinc-400"
        >
          <Icon name="grip" />
        </Button>
        {mobile && (
          <Button
            variant="ghost"
            size="standard"
            iconOnly={true}
            aria-label="Preview controls"
            aria-expanded={expanded}
            aria-controls={controlsId}
            title="Preview controls"
            onClick={() => setExpanded((current) => !current)}
            className="rounded-full"
          >
            <span
              className={cn(
                'transition-transform motion-reduce:transition-none',
                expanded ? '-rotate-90' : 'rotate-90',
              )}
            >
              <Icon name="chevron-right" />
            </span>
          </Button>
        )}
      </div>
      <div
        id={controlsId}
        hidden={mobile && !expanded}
        className={cn(
          'flex-wrap items-center gap-1',
          mobile && !expanded ? 'hidden' : 'flex',
          mobile ? 'kit-preview-actions max-w-full flex-col justify-center px-2 pb-1' : 'min-w-0',
        )}
      >
        <div className="flex min-w-0 max-w-full flex-wrap items-center justify-center gap-1">
          {controls}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <a
            data-touch-target=""
            href={kitHref}
            aria-label="Component kit"
            className={cn(
              'flex shrink-0 items-center justify-center rounded-full text-zinc-300 hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring',
              mobile ? 'size-11' : 'size-8',
            )}
          >
            <Icon name="extension" size="sm" />
          </a>
          <Button
            variant="ghost"
            size={mobile ? 'standard' : 'compact'}
            iconOnly={true}
            aria-label="Reset demo"
            onClick={onReset}
            className="rounded-full"
          >
            <Icon name="undo" size="sm" />
          </Button>
        </div>
      </div>
      {mobile && expanded && (
        <span className="px-3 pb-2 text-caption text-zinc-400">Sample data · {chat}</span>
      )}
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
/**
 * Consecutive tool calls folded into one line ("Read 3 files · staged 2 files"), so the reply stays
 * in view on a phone. Opening it lists each ToolResult; each of those opens to its JSON.
 */
export function ToolGroup({
  summary,
  count,
  running,
  error,
  children,
}: {
  summary: string;
  count: number;
  running?: boolean;
  error?: boolean;
  children: ReactNode;
}) {
  return (
    <details className="group/tools overflow-hidden rounded-xl border bg-surface text-label">
      <summary
        data-touch-target=""
        className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5"
      >
        <Icon name={error ? 'warning' : running ? 'clock' : 'check'} size="sm" />
        <span className={cn('min-w-0 flex-1 truncate font-medium', error && 'text-destructive')}>
          {summary}
        </span>
        <span className="shrink-0 text-xs text-muted-foreground">
          {count} {count === 1 ? 'step' : 'steps'}
        </span>
        <span className="shrink-0 text-muted-foreground transition-transform group-open/tools:rotate-90">
          <Icon name="chevron-right" size="sm" />
        </span>
      </summary>
      <div className="flex flex-col divide-y border-t [&>details]:rounded-none [&>details]:border-0 [&>details]:bg-transparent">
        {children}
      </div>
    </details>
  );
}
/** What the agent is doing right now, in one line: replaces a stack of progress messages. */
export function LiveStatus({ children }: { children: ReactNode }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground"
    >
      <span className="inline-block size-2 shrink-0 rounded-full bg-events motion-safe:animate-pulse" />
      <span className="min-w-0 truncate">{children}</span>
    </div>
  );
}
export function Json({ value }: { value: unknown }) {
  return (
    <pre className="m-0 max-h-64 overflow-auto whitespace-pre-wrap break-words font-mono text-xs">
      {JSON.stringify(value, null, 2)}
    </pre>
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
function PositionedPreview({
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

/** Link interpretation stays with the caller; the kit owns hover delay, anchors and dismissal. */
export function HoverPreview(
  props:
    | { title: string; text?: string; anchor: DOMRect }
    | {
        resolve: (href: string) => { title: string; text?: string } | undefined;
        selector: string;
      },
) {
  const resolver = 'resolve' in props ? props.resolve : undefined;
  const selector = 'selector' in props ? props.selector : '';
  const policy = usePresentationPolicy();
  const [preview, setPreview] = useState<{ title: string; text?: string; anchor: DOMRect } | null>(
    null,
  );
  useEffect(() => {
    setPreview(null);
    if (!resolver) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const pointer = policy.portal?.closest('[data-kit-pointer]')?.getAttribute('data-kit-pointer');
    const hover = pointer
      ? pointer === 'fine'
      : matchMedia('(hover: hover) and (pointer: fine)').matches;
    const leave = () => {
      clearTimeout(timer);
      setPreview(null);
    };
    const over = (event: MouseEvent) => {
      const anchor =
        event.target instanceof Element ? event.target.closest<HTMLAnchorElement>(selector) : null;
      if (!(anchor && hover && policy.owns(anchor))) return;
      clearTimeout(timer);
      timer = setTimeout(() => {
        const content = resolver(anchor.getAttribute('href') ?? '');
        if (content) setPreview({ ...content, anchor: anchor.getBoundingClientRect() });
      }, 250);
    };
    const out = (event: MouseEvent) => {
      if (
        policy.owns(event.target) &&
        event.target instanceof Element &&
        event.target.closest(selector)
      )
        leave();
    };
    const scroll = (event: Event) => {
      if (event.target === document || event.target === window || policy.owns(event.target))
        leave();
    };
    addEventListener('mouseover', over);
    addEventListener('mouseout', out);
    addEventListener('hashchange', leave);
    addEventListener('scroll', scroll, true);
    return () => {
      clearTimeout(timer);
      removeEventListener('mouseover', over);
      removeEventListener('mouseout', out);
      removeEventListener('hashchange', leave);
      removeEventListener('scroll', scroll, true);
    };
  }, [resolver, selector, policy]);
  if ('anchor' in props) return <PositionedPreview {...props} />;
  return preview ? <PositionedPreview {...preview} /> : null;
}
