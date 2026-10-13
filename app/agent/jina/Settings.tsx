import type { Credential } from '../../vault/session/credentials.ts';
import { CredentialSetting } from '../../vault/session/ui.tsx';
import { jinaSettings } from './settings.ts';

export function JinaSettings({ credential }: { credential: Credential }) {
  const field = jinaSettings.fields.find((candidate) => candidate.key === 'jina')!;
  return <CredentialSetting credential={credential} field={field} />;
}
