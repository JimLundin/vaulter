// Input button comparison on the existing preview route: ?variant=A|B|C.
// A: white outlined; B: black filled; C: plain. Microphone and Enter match.
import { createContext, type ReactNode, useContext, useEffect, useState } from 'react';
import { Button } from './parts/button.tsx';
import { Icon } from './icons.tsx';
import { useLayout } from './hooks/use-layout.ts';

const options = [
  { key: 'A', name: 'White · outlined' },
  { key: 'B', name: 'Black · filled' },
  { key: 'C', name: 'Plain · no border' },
] as const;
const InputButtonStyle = createContext<(typeof options)[number]['key'] | undefined>(undefined);
const InputButtonSelection = createContext<{ index: number; select: (index: number) => void }>({
  index: 0,
  select: (_index) => undefined,
});

export const useInputPreviewStyle = () => useContext(InputButtonStyle);

export function InputPreviewVariants({ children }: { children: ReactNode }) {
  return import.meta.env.MODE === 'design' ? (
    <SelectedInputVariants>{children}</SelectedInputVariants>
  ) : (
    children
  );
}

function SelectedInputVariants({ children }: { children: ReactNode }) {
  const read = () =>
    Math.max(
      0,
      options.findIndex(
        (option) => option.key === new URLSearchParams(location.search).get('variant'),
      ),
    );
  const [index, setIndex] = useState(read);
  const select = (nextIndex: number) => {
    const next = (nextIndex + options.length) % options.length;
    const url = new URL(location.href);
    url.searchParams.set('variant', options[next].key);
    history.replaceState(history.state, '', url);
    setIndex(next);
  };
  useEffect(() => {
    const onPopState = () => setIndex(read());
    const onKeyDown = (event: KeyboardEvent) => {
      const { target } = event;
      if (
        target instanceof Element &&
        target.closest(
          'input, textarea, select, [contenteditable], [role=combobox], [role=radio], [role=tab]',
        )
      )
        return;
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault();
        select(index + (event.key === 'ArrowRight' ? 1 : -1));
      }
    };
    globalThis.addEventListener('popstate', onPopState);
    globalThis.addEventListener('keydown', onKeyDown);
    return () => {
      globalThis.removeEventListener('popstate', onPopState);
      globalThis.removeEventListener('keydown', onKeyDown);
    };
  });
  return (
    <InputButtonSelection.Provider value={{ index, select }}>
      <InputButtonStyle.Provider value={options[index].key}>{children}</InputButtonStyle.Provider>
    </InputButtonSelection.Provider>
  );
}

export function InputPreviewSwitcher() {
  const { index, select } = useContext(InputButtonSelection);
  const compact = useLayout() === 'compact';
  if (import.meta.env.MODE !== 'design') return null;
  if (compact)
    return (
      <fieldset aria-label="Input button style preview" className="min-w-0 flex-1">
        <select
          aria-label="Input button variant"
          className="kit-preview-select w-full"
          value={options[index].key}
          onChange={(event) =>
            select(options.findIndex((option) => option.key === event.target.value))
          }
        >
          <option value="A">A · Outline</option>
          <option value="B">B · Filled</option>
          <option value="C">C · Plain</option>
        </select>
      </fieldset>
    );
  return (
    <fieldset
      aria-label="Input button style preview"
      className="flex shrink-0 items-center rounded-full bg-foreground px-1 py-1 text-background shadow-sm"
    >
      <Button
        type="button"
        variant="ghost"
        className="text-background hover:bg-background/15 hover:text-background dark:hover:bg-background/15"
        size="compact"
        iconOnly={true}
        aria-label="Previous variant"
        onClick={() => select(index - 1)}
      >
        <Icon name="chevron-left" />
      </Button>
      <span aria-live="polite" className="min-w-32 text-center text-xs">
        {options[index].key} · {options[index].name}
      </span>
      <Button
        type="button"
        variant="ghost"
        className="text-background hover:bg-background/15 hover:text-background dark:hover:bg-background/15"
        size="compact"
        iconOnly={true}
        aria-label="Next variant"
        onClick={() => select(index + 1)}
      >
        <Icon name="chevron-right" />
      </Button>
    </fieldset>
  );
}
