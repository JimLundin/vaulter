// Private state shared by SettingField and its supported controls through ordinary layouts.
import { createContext, useContext, useId, useLayoutEffect } from 'react';

export type FieldControl = { id: string; kind: 'text' | 'group' | 'unsupported' };

export const FieldAssociation = createContext<{
  controlId: string;
  labelId: string;
  descriptionId: string;
  registerControl: (key: string, control: FieldControl) => () => void;
} | null>(null);

function useFieldAssociation(
  kind: 'text' | 'group' | 'unsupported',
  props: { id?: string; 'aria-describedby'?: string },
) {
  const field = useContext(FieldAssociation);
  const key = useId();
  const id = props.id ?? field?.controlId;
  const registerControl = field?.registerControl;
  useLayoutEffect(() => {
    if (id) return registerControl?.(key, { id, kind });
  }, [id, key, kind, registerControl]);
  if (!field || kind === 'unsupported') return {};
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

export const useFieldTextAssociation = (props: {
  id?: string;
  type?: string;
  'aria-describedby'?: string;
}) =>
  useFieldAssociation(
    !props.type || ['text', 'email', 'password', 'search', 'tel', 'url'].includes(props.type)
      ? 'text'
      : 'unsupported',
    props,
  );
export const useFieldGroupAssociation = (props: { id?: string; 'aria-describedby'?: string }) =>
  useFieldAssociation('group', props);

/** Unsupported kit controls register only to diagnose invalid field composition. */
export const useFieldUnsupportedControl = () => {
  useFieldAssociation('unsupported', {});
};
