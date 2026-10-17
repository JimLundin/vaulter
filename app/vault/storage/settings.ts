import type { SettingsDefinition } from '@/settings/store.ts';
import { API, REPO } from './github-client/api.ts';

export const githubSettings: SettingsDefinition = {
  id: 'github',
  name: 'GitHub storage',
  fields: [
    {
      key: 'github',
      label: 'GitHub token',
      description: 'Used to read and publish vault changes. Reconnects storage when replaced.',
      kind: 'secret',
    },
    {
      key: 'repository',
      label: 'Vault repository',
      description: 'The repository used by this installation. Configured when the app is built.',
      kind: 'readonly',
      defaultValue: `${REPO.owner}/${REPO.name}@${REPO.branch}`,
    },
    {
      key: 'api',
      label: 'GitHub API endpoint',
      description:
        'The GitHub endpoint allowed by this installation. Configured when the app is built.',
      kind: 'readonly',
      defaultValue: API,
    },
  ],
};
