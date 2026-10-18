import { SettingsDisclosure, SettingsInfo, Stack, Text } from '@/shared/ui/kit/index.ts';
import type { Credential } from '@/core/session/index.ts';
import { CredentialSetting } from '@/core/session/presentation/index.ts';
import { githubSettings } from '@/core/persistence/settings.ts';

export function GitHubSettings({ credential }: { credential: Credential }) {
  const field = githubSettings.fields.find((candidate) => candidate.key === 'github')!;
  const details = githubSettings.fields.filter((candidate) => candidate.kind === 'readonly');
  return (
    <Stack gap="lg">
      <Text size="sm" tone="muted" preserve={true}>
        {details.find((field) => field.key === 'repository')?.defaultValue}
      </Text>
      <SettingsDisclosure
        title="Manage GitHub connection"
        summary={credential.configured ? 'Configured' : 'Not configured'}
        defaultOpen={!(credential.configured || credential.disabledReason)}
      >
        <CredentialSetting credential={credential} field={field} />
      </SettingsDisclosure>
      <SettingsDisclosure title="GitHub connection details">
        {details.map((field) => (
          <SettingsInfo key={field.key} label={field.label} value={field.defaultValue ?? ''} />
        ))}
      </SettingsDisclosure>
    </Stack>
  );
}
