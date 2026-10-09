// Settings compose shared layout, typography and field primitives; features supply their controls.
import { type ReactNode, useCallback, useId, useMemo, useState } from 'react';
import { FieldAssociation } from './field-association.ts';
import { Field, FieldContent, FieldDescription, FieldLabel } from './parts/field.tsx';
import { FeaturePage } from './app.tsx';
import { Heading, Stack } from './parts/layout.tsx';
import { Surface } from './primitives.tsx';
import { MenuSheet } from './sheet.tsx';

export function SettingsPage({ children }: { children: ReactNode }) {
  return (
    <FeaturePage title="Settings" description="Preferences for this device">
      <Stack gap="xl" block="md">
        {children}
      </Stack>
    </FeaturePage>
  );
}
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
    <MenuSheet
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
    </MenuSheet>
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
export function SettingField({
  label,
  htmlFor,
  description,
  descriptionId,
  children,
}: {
  label: string;
  htmlFor?: string;
  description: string;
  descriptionId?: string;
  children: ReactNode;
}) {
  const generatedId = useId();
  const controlId = `${generatedId}-control`;
  const labelId = `${generatedId}-label`;
  const effectiveDescriptionId = descriptionId ?? `${generatedId}-description`;
  const [registeredId, setRegisteredId] = useState<string>();
  const registerControl = useCallback((id: string) => setRegisteredId(id), []);
  const association = useMemo(
    () => ({ controlId, labelId, descriptionId: effectiveDescriptionId, registerControl }),
    [controlId, labelId, effectiveDescriptionId, registerControl],
  );
  return (
    <FieldAssociation.Provider value={association}>
      <Field orientation="setting">
        <FieldLabel id={labelId} htmlFor={registeredId ?? htmlFor ?? controlId}>
          {label}
        </FieldLabel>
        <FieldContent>{children}</FieldContent>
        <FieldDescription id={effectiveDescriptionId}>{description}</FieldDescription>
      </Field>
    </FieldAssociation.Provider>
  );
}
