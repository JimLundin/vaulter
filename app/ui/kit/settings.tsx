// Settings compose shared layout, typography and field primitives; features supply their controls.
import * as React from 'react';
import {
  isValidElement,
  type ReactNode,
  useCallback,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  FieldAssociation,
  type FieldControl,
  hasFieldControlSemantics,
} from './field-association.ts';
import { Field, FieldContent, FieldDescription, FieldLabel, FieldTitle } from './parts/field.tsx';
import { Heading } from './parts/layout.tsx';
import { Surface } from './primitives.tsx';
import { Drawer } from './drawer.tsx';

/** Product supplies feature-owned fields, grouped under each feature's name. */
export function SettingsMenu({
  open,
  onClose,
  features,
  children,
}: {
  open: boolean;
  onClose: () => void;
  features: { name: string; content: ReactNode }[];
  children?: ReactNode;
}) {
  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Settings"
      description="Preferences for this device"
    >
      <Surface variant="preferences">
        {children}
        {features.map((feature) => (
          <SettingsSection key={feature.name} title={feature.name}>
            {feature.content}
          </SettingsSection>
        ))}
      </Surface>
    </Drawer>
  );
}
export function SettingsSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Surface as="section" aria-label={title} variant="grouped">
      <Surface variant="groupHeading">
        <Heading level={2}>{title}</Heading>
      </Surface>
      <Surface variant="inset">{children}</Surface>
    </Surface>
  );
}
// Ordinary React children can be inspected without cloning controls or searching the DOM.
// Public kit props and opaque feature components are validated by mounted registration.
function hasUnsupportedControl(children: ReactNode): boolean {
  return React.Children.toArray(children).some((child) => {
    if (
      !isValidElement<{ children?: ReactNode; role?: string; contentEditable?: boolean | string }>(
        child,
      )
    )
      return false;
    if (
      typeof child.type === 'string' &&
      (['input', 'textarea', 'select'].includes(child.type) ||
        hasFieldControlSemantics(child.props))
    )
      return true;
    return hasUnsupportedControl(child.props.children);
  });
}

export function SettingField({
  label,
  description,
  children,
}: {
  label: string;
  description: string;
  children: ReactNode;
}) {
  const generatedId = useId();
  const controlId = `${generatedId}-control`;
  const labelId = `${generatedId}-label`;
  const effectiveDescriptionId = `${generatedId}-description`;
  const controls = useRef(new Map<string, FieldControl>());
  const mounted = useRef(false);
  const [, notify] = useState(0);
  const [registeredControl, setRegisteredControl] = useState<FieldControl>();
  const registerControl = useCallback((key: string, control: FieldControl) => {
    controls.current.set(key, control);
    if (mounted.current) notify((version) => version + 1);
    return () => {
      controls.current.delete(key);
      if (mounted.current) notify((version) => version + 1);
    };
  }, []);
  useLayoutEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useLayoutEffect(() => {
    if (
      hasUnsupportedControl(children) ||
      [...controls.current.values()].some((candidate) => candidate.kind === 'unsupported')
    ) {
      throw new Error(
        `SettingField "${label}" contains an unsupported semantic control; use one supported text control or radio group.`,
      );
    }
    if (controls.current.size !== 1) {
      throw new Error(
        `SettingField "${label}" requires exactly one supported text control or radio group; found ${controls.current.size}.`,
      );
    }
    const control = controls.current.values().next().value;
    if (control?.id !== registeredControl?.id || control?.kind !== registeredControl?.kind) {
      setRegisteredControl(control);
    }
  });
  const association = useMemo(
    () => ({ controlId, labelId, descriptionId: effectiveDescriptionId, registerControl }),
    [controlId, labelId, effectiveDescriptionId, registerControl],
  );
  return (
    <FieldAssociation.Provider value={association}>
      <Field orientation="setting">
        {registeredControl?.kind === 'group' ? (
          <FieldTitle id={labelId}>{label}</FieldTitle>
        ) : (
          <FieldLabel id={labelId} htmlFor={registeredControl?.id ?? controlId}>
            {label}
          </FieldLabel>
        )}
        <FieldContent>{children}</FieldContent>
        <FieldDescription id={effectiveDescriptionId}>{description}</FieldDescription>
      </Field>
    </FieldAssociation.Provider>
  );
}
