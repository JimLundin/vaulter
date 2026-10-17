import { ModuleSettings } from '@/settings/ModuleSettings.tsx';
import type { SettingsDefinition, SettingsStore } from '@/settings/store.ts';
import { Stack } from '@/ui/kit/index.ts';
import type { Credential } from '@/vault/session/credentials.ts';
import { CredentialSetting } from '@/vault/session/ui.tsx';

/** The caller supplies the same OpenAI-owned preferences used to configure its capabilities. */
export function OpenAISettings({
  definition,
  preferences,
  credential,
}: {
  definition: SettingsDefinition;
  preferences: SettingsStore;
  credential: Credential;
}) {
  const field = definition.fields.find((candidate) => candidate.key === 'openai')!;
  return (
    <Stack gap="lg">
      <CredentialSetting credential={credential} field={field} />
      <ModuleSettings definition={definition} store={preferences} />
    </Stack>
  );
}
