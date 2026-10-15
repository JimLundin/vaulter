import { createSettings } from '../../settings/store.ts';
import { Stack } from '../../ui/kit/index.ts';
import { ModuleSettings } from '../../settings/ModuleSettings.tsx';
import type { Credential } from '../session/credentials.ts';
import { CredentialSetting } from '../session/ui.tsx';
import { githubSettings } from './settings.ts';

const preferences = createSettings(githubSettings);

export function GitHubSettings({ credential }: { credential: Credential }) {
  const field = githubSettings.fields.find((candidate) => candidate.key === 'github')!;
  return (
    <Stack gap="lg">
      <CredentialSetting credential={credential} field={field} />
      <ModuleSettings definition={githubSettings} store={preferences} />
    </Stack>
  );
}
