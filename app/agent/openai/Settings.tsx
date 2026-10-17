import { ModuleSettings } from '@/settings/ModuleSettings.tsx';
import type { SettingsDefinition, SettingsStore } from '@/settings/store.ts';
import { SettingsDisclosure, SettingsInfo, Stack } from '@/ui/kit/index.ts';
import type { Credential } from '@/vault/session/credentials.ts';
import { CredentialSetting } from '@/vault/session/ui.tsx';

export function OpenAISettings({
  definition,
  preferences,
  credential,
  connection = false,
}: {
  definition: SettingsDefinition;
  preferences: SettingsStore;
  credential: Credential;
  connection?: boolean;
}) {
  if (connection) {
    const field = definition.fields.find((candidate) => candidate.key === 'openai')!;
    return (
      <Stack gap="lg">
        <SettingsDisclosure
          title="Manage OpenAI connection"
          summary={credential.configured ? 'Configured' : 'Not configured'}
          defaultOpen={!(credential.configured || credential.disabledReason)}
        >
          <CredentialSetting credential={credential} field={field} />
        </SettingsDisclosure>
        <SettingsDisclosure title="OpenAI connection details">
          <SettingsInfo
            label="OpenAI API endpoint"
            value={definition.fields.find((field) => field.key === 'api')?.defaultValue ?? ''}
          />
        </SettingsDisclosure>
      </Stack>
    );
  }
  return (
    <Stack gap="lg">
      <ModuleSettings definition={definition} store={preferences} keys={['model', 'voice']} />
      <ModuleSettings
        definition={definition}
        store={preferences}
        keys={['voiceModel', 'liveTranscriptionModel', 'fileTranscriptionModel']}
        disclosure="Voice and transcription models"
      />
    </Stack>
  );
}
