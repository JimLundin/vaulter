// Preview selection stays local to this focused control, including paired catalogue previews.
import { Icon } from './icons.tsx';

export function DesignCycle({
  label,
  value,
  options,
  onChange,
  previousLabel = 'Previous design',
  nextLabel = 'Next design',
}: {
  label: string;
  value: string;
  options: readonly { value: string; label: string }[];
  onChange: (value: string) => void;
  previousLabel?: string;
  nextLabel?: string;
}) {
  const index = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  );
  const multiple = options.length > 1;
  const cycle = (direction: number) => {
    if (multiple) onChange(options[(index + direction + options.length) % options.length].value);
  };
  if (!options.length) return null;
  return (
    <fieldset
      aria-label={label}
      className="flex min-w-0 max-w-full shrink-0 items-center rounded-full bg-muted p-1 text-foreground"
      onKeyDown={(event) => {
        if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
        event.preventDefault();
        event.stopPropagation();
        cycle(event.key === 'ArrowRight' ? 1 : -1);
      }}
    >
      <button
        type="button"
        aria-label={previousLabel}
        data-touch-target=""
        disabled={!multiple}
        className="flex size-8 shrink-0 items-center justify-center rounded-full hover:bg-background disabled:opacity-30 focus-visible:outline-2 focus-visible:outline-ring"
        onClick={() => cycle(-1)}
      >
        <Icon name="chevron-left" size="sm" />
      </button>
      <button
        type="button"
        aria-label={label}
        aria-keyshortcuts="ArrowLeft ArrowRight"
        data-touch-target=""
        title="Use Left and Right to cycle designs while this control has focus."
        className="flex min-h-8 min-w-0 max-w-64 items-center gap-2 rounded-full px-3 text-xs hover:bg-background focus-visible:outline-2 focus-visible:outline-ring"
        onClick={() => cycle(1)}
      >
        <span aria-live="polite" className="truncate">
          {options[index].label}
        </span>
        <span className="shrink-0 text-muted-foreground">
          {index + 1} / {options.length}
        </span>
      </button>
      <button
        type="button"
        aria-label={nextLabel}
        data-touch-target=""
        disabled={!multiple}
        className="flex size-8 shrink-0 items-center justify-center rounded-full hover:bg-background disabled:opacity-30 focus-visible:outline-2 focus-visible:outline-ring"
        onClick={() => cycle(1)}
      >
        <Icon name="chevron-right" size="sm" />
      </button>
    </fieldset>
  );
}
