import type { SettingsDefinition } from '@/application/settings/store.ts';
import { SettingField, ThemeSwitch } from '@/ui/kit/index.ts';

export const appearanceSettings: SettingsDefinition = {
  id: 'appearance',
  name: 'Appearance',
  fields: [
    {
      key: 'theme',
      label: 'Theme',
      description: "Choose a theme, or follow your device's appearance.",
      defaultValue: 'system',
    },
  ],
};

export function AppearanceSettings() {
  const field = appearanceSettings.fields[0]!;
  return (
    <SettingField label={field.label} description={field.description}>
      <ThemeSwitch />
    </SettingField>
  );
}
