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
  kind: 'text' | 'group' | 'unsupported' | undefined,
  props: { id?: string; 'aria-describedby'?: string },
) {
  const field = useContext(FieldAssociation);
  const key = useId();
  const id = props.id ?? field?.controlId;
  const registerControl = field?.registerControl;
  useLayoutEffect(() => {
    if (id && kind) return registerControl?.(key, { id, kind });
  }, [id, key, kind, registerControl]);
  if (!field || !kind || kind === 'unsupported') return {};
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
  role?: string;
  'aria-describedby'?: string;
}) =>
  useFieldAssociation(
    (!props.type || ['text', 'email', 'password', 'search', 'tel', 'url'].includes(props.type)) &&
      (!props.role || ['textbox', 'searchbox'].includes(props.role))
      ? 'text'
      : 'unsupported',
    props,
  );
export const useFieldGroupAssociation = (props: {
  id?: string;
  role?: string;
  'aria-describedby'?: string;
}) =>
  useFieldAssociation(!props.role || props.role === 'radiogroup' ? 'group' : 'unsupported', props);

/** Unsupported kit controls register only to diagnose invalid field composition. */
export const useFieldUnsupportedControl = () => {
  useFieldAssociation('unsupported', {});
};

type SemanticProps = { role?: string; contentEditable?: boolean | string };

export function hasFieldControlSemantics({ role, contentEditable }: SemanticProps) {
  return (
    contentEditable === true ||
    contentEditable === 'true' ||
    contentEditable === 'plaintext-only' ||
    [
      'textbox',
      'searchbox',
      'radiogroup',
      'checkbox',
      'switch',
      'combobox',
      'slider',
      'spinbutton',
      'radio',
      'listbox',
    ].includes(role ?? '')
  );
}

/** Public primitive props diagnose value controls even through opaque feature components. */
export function useFieldSemanticDiagnostic(props: object, supportedRoles: readonly string[] = []) {
  const { role, contentEditable } = props as SemanticProps;
  const unsupported =
    hasFieldControlSemantics({ contentEditable }) ||
    (hasFieldControlSemantics({ role }) && !supportedRoles.includes(role ?? ''));
  useFieldAssociation(unsupported ? 'unsupported' : undefined, {});
}
