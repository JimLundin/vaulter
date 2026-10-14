// Throwaway page-rail presentation. Modules retain their actions and filter state.
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

export interface PageSearchProps {
  label: string;
  placeholder: string;
  value: string;
  onValueChange: (value: string) => void;
  type?: 'text' | 'search';
}

interface PageControl {
  actions?: ReactNode;
  search?: PageSearchProps;
}

export const PrototypePageControlsContext = createContext<{
  enabled: boolean;
  register: (id: string, control: PageControl | null) => void;
} | null>(null);

export function usePrototypePageControls(enabled: boolean) {
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
  };
}

export function usePrototypePageControl({ actions, search }: PageControl) {
  const context = useContext(PrototypePageControlsContext);
  const id = useId();
  useLayoutEffect(() => {
    if (!context?.enabled) return;
    context.register(id, { actions, search });
    return () => context.register(id, null);
  }, [context, id, actions, search]);
  return !!context?.enabled;
}

/** A module-owned filter, shown inline normally or in the prototype's shared bottom input. */
export function PageSearch(props: PageSearchProps) {
  const { label, placeholder, value, onValueChange, type } = props;
  const search = useMemo(
    () => ({ label, placeholder, value, onValueChange, type }),
    [label, placeholder, value, onValueChange, type],
  );
  const inRail = usePrototypePageControl({ search });
  if (inRail) return null;
  return (
    <Input
      type={type}
      aria-label={label}
      placeholder={placeholder}
      value={value}
      onChange={(event) => onValueChange(event.target.value)}
    />
  );
}
