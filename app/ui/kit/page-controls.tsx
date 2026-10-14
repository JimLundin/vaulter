// Modules own page control values and actions. Shared navigation owns their responsive placement.
import {
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

export interface PageFilterControl {
  label: string;
  value: string;
  options: readonly { value: string; label: string }[];
  onValueChange: (value: string) => void;
  /** The owning module decides whether its selected filter limits the collection. */
  active: boolean;
}

export interface PageControlsProps {
  actions?: ReactNode;
  search?: PageSearchControl;
  filters?: PageFilterControl;
  /** Optional existing inline filter content; the rail uses the supplied filter choices. */
  children?: ReactNode;
}

type PageControl = Omit<PageControlsProps, 'children'>;

export const PageControlsContext = createContext<{
  enabled: boolean;
  register: (id: string, control: PageControl | null) => void;
} | null>(null);

export function usePageControls(enabled: boolean) {
  const [entries, setEntries] = useState<(PageControl & { id: string })[]>([]);
  const register = useCallback((id: string, control: PageControl | null) => {
    setEntries((current) => [
      ...current.filter((entry) => entry.id !== id),
      ...(control ? [{ id, ...control }] : []),
    ]);
  }, []);
  const context = useMemo(() => ({ enabled, register }), [enabled, register]);
  return {
    context,
    actions: entries.find((entry) => entry.actions)?.actions,
    search: entries.find((entry) => entry.search),
    filters: entries.find((entry) => entry.filters)?.filters,
  };
}

function usePageControl({ actions, search, filters }: PageControl) {
  const context = useContext(PageControlsContext);
  const id = useId();
  useLayoutEffect(() => {
    if (!(context?.enabled && (actions || search || filters))) return;
    context.register(id, { actions, search, filters });
    return () => context.register(id, null);
  }, [context, id, actions, search, filters]);
  return !!context?.enabled;
}

/** Page controls render inline on desktop and in the app-owned rail on compact layouts. */
export function PageControls({ actions, search, filters, children }: PageControlsProps) {
  const inRail = usePageControl({ actions, search, filters });
  if (inRail) return null;
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
              type="single"
              aria-label={filters.label}
              value={filters.value}
              onValueChange={filters.onValueChange}
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
