// Restored from preview-input-variants.tsx: arrow cycling on desktop, compact mobile selection.
import { createContext, useContext, useEffect } from 'react';
import { Icon } from './icons.tsx';
import { useLayout } from './hooks/use-layout.ts';

export function PreviewVariantSwitcher({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: readonly { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  const compact = useLayout() === 'compact';
  const index = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  );
  const select = (next: number) =>
    onChange(options[(next + options.length) % options.length].value);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.target instanceof Element &&
        event.target.closest(
          'input, textarea, select, button, [contenteditable], [role=combobox], [role=radio], [role=tab]',
        )
      )
        return;
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault();
        select(index + (event.key === 'ArrowRight' ? 1 : -1));
      }
    };
    globalThis.addEventListener('keydown', onKeyDown);
    return () => globalThis.removeEventListener('keydown', onKeyDown);
  });
  if (!options.length) return null;
  if (compact)
    return (
      <fieldset aria-label={label} className="min-w-0 flex-1">
        <select
          aria-label={label}
          className="kit-preview-select w-full"
          value={value}
          onChange={(event) => onChange(event.target.value)}
        >
          {options.map((option, i) => (
            <option key={option.value} value={option.value}>
              {String.fromCharCode(65 + i)} · {option.label}
            </option>
          ))}
        </select>
      </fieldset>
    );
  return (
    <fieldset
      aria-label={label}
      className="flex shrink-0 items-center rounded-full bg-foreground px-1 py-1 text-background shadow-sm"
    >
      <button
        type="button"
        aria-label="Previous variant"
        className="flex size-8 items-center justify-center rounded-full hover:bg-background/15 focus-visible:outline-2"
        onClick={() => select(index - 1)}
      >
        <Icon name="chevron-left" />
      </button>
      <span aria-live="polite" className="min-w-32 text-center text-xs">
        {String.fromCharCode(65 + index)} · {options[index].label}
      </span>
      <button
        type="button"
        aria-label="Next variant"
        className="flex size-8 items-center justify-center rounded-full hover:bg-background/15 focus-visible:outline-2"
        onClick={() => select(index + 1)}
      >
        <Icon name="chevron-right" />
      </button>
    </fieldset>
  );
}

export const PreviewVariantContext = createContext<Readonly<Record<string, string>>>({});
/** Preview overrides target a rendered component, never a production controller. */
export const usePreviewVariant = (target: string) => useContext(PreviewVariantContext)[target];
