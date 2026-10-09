// Private state shared by SettingField and its supported controls through ordinary layouts.
import { createContext, useContext, useLayoutEffect } from 'react';

export const FieldAssociation = createContext<{
  controlId: string;
  labelId: string;
  descriptionId: string;
  registerControl: (id: string) => void;
} | null>(null);

export function useFieldTextAssociation(props: { id?: string; 'aria-describedby'?: string }) {
  const field = useContext(FieldAssociation);
  const id = props.id ?? field?.controlId;
  const registerControl = field?.registerControl;
  useLayoutEffect(() => {
    if (id) registerControl?.(id);
  }, [id, registerControl]);
  if (!field) return {};
  return {
    id,
    'aria-label': undefined,
    'aria-labelledby': field.labelId,
    'aria-describedby': [
      ...new Set(
        `${props['aria-describedby'] ?? ''} ${field.descriptionId}`.split(/\s+/).filter(Boolean),
      ),
    ].join(' '),
  };
}
