// Modules own page control values and actions. Shared navigation owns their responsive placement.
import React, {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useId,
  useLayoutEffect,
  useMemo,
  useState,
} from 'react';
import { Input } from './parts/input.tsx';
import { ToggleGroup, ToggleGroupItem } from './parts/toggle-group.tsx';

export interface PageSearchControl {
  label: string;
  placeholder: string;
  value: string;
  onValueChange: (value: string) => void;
  type?: 'text' | 'search';
}

interface PageFilterChoices {
  label: string;
  options: readonly { value: string; label: string }[];
  /** The owning module decides whether its selected filter limits the collection. */
  active: boolean;
}
export type PageFilterControl = PageFilterChoices &
  (
    | { type?: 'single'; value: string; onValueChange: (value: string) => void }
    | { type: 'multiple'; value: string[]; onValueChange: (value: string[]) => void }
  );

export interface PageControlsProps {
  actions?: ReactNode;
  /** Horizontal navigation shown in a compact bottom rail, separate from side actions. */
  bottomActions?: ReactNode;
  search?: PageSearchControl;
  filters?: PageFilterControl;
  /** Split declarations from a richer expanded form, without duplicating compact controls. */
  placement?: 'responsive' | 'rail' | 'expanded';
  /** Optional existing inline filter content; the rail uses the supplied filter choices. */
  children?: ReactNode;
}

type PageControl = Omit<PageControlsProps, 'children' | 'placement'>;

export const PageControlsContext = createContext<{
  enabled: boolean;
  register: (id: string, control: PageControl | null) => void;
} | null>(null);

export function usePageControls(enabled: boolean) {
  const [entries, setEntries] = useState<(PageControl & { id: string })[]>([]);
  const register = useCallback((id: string, control: PageControl | null) => {
    setEntries((current) => {
      if (!control) return current.filter((entry) => entry.id !== id);
      const next = { id, ...control };
      return current.some((entry) => entry.id === id)
        ? current.map((entry) => (entry.id === id ? next : entry))
        : [...current, next];
    });
  }, []);
  const context = useMemo(() => ({ enabled, register }), [enabled, register]);
  return {
    context,
    actions: entries.some((entry) => entry.actions)
      ? entries.map((entry) => <React.Fragment key={entry.id}>{entry.actions}</React.Fragment>)
      : undefined,
    bottomActions: entries.some((entry) => entry.bottomActions)
      ? entries.map((entry) => (
          <React.Fragment key={entry.id}>{entry.bottomActions}</React.Fragment>
        ))
      : undefined,
    search: entries.find((entry) => entry.search),
    filters: entries.find((entry) => entry.filters)?.filters,
  };
}

function usePageControl({ actions, bottomActions, search, filters }: PageControl, register = true) {
  const context = useContext(PageControlsContext);
  const id = useId();
  useLayoutEffect(() => {
    if (!context?.enabled) return;
    context.register(
      id,
      register && (actions || bottomActions || search || filters)
        ? { actions, bottomActions, search, filters }
        : null,
    );
  }, [context, id, actions, bottomActions, search, filters, register]);
  useLayoutEffect(() => () => context?.register(id, null), [context, id]);
  return !!context?.enabled;
}

/** Page controls render inline on desktop and in the app-owned rail on compact layouts. */
export function PageControls({
  actions,
  bottomActions,
  search,
  filters,
  children,
  placement = 'responsive',
}: PageControlsProps) {
  const inRail = usePageControl(
    { actions, bottomActions, search, filters },
    placement !== 'expanded',
  );
  if (inRail || placement === 'rail') return null;
  return (
    <>
      {actions}
      {!!search && (
        <Input
          type={search.type}
          aria-label={search.label}
          placeholder={search.placeholder}
          value={search.value}
          onChange={(event) => search.onValueChange(event.target.value)}
        />
      )}
      {children !== undefined
        ? children
        : filters && (
            <ToggleGroup
              {...(filters.type === 'multiple'
                ? {
                    type: 'multiple' as const,
                    value: filters.value,
                    onValueChange: filters.onValueChange,
                  }
                : {
                    type: 'single' as const,
                    value: filters.value,
                    onValueChange: filters.onValueChange,
                  })}
              aria-label={filters.label}
            >
              {filters.options.map((option) => (
                <ToggleGroupItem key={option.value} value={option.value}>
                  {option.label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          )}
    </>
  );
}
