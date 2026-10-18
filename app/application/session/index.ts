// The Vault exposes its EAV session and credential controls.
export { useSession as useVaultSession } from './session.ts';
export type { OpenJournal } from './adapters.ts';
export { VaultGate } from './Gate.tsx';
export { CredentialSetting, RefreshVault, SessionStatus, SignOut, Unlock } from './ui.tsx';
export {
  createSessionCredentials,
  restrictSessionCredentials,
  type Credential,
  type SessionCredentials,
} from './credentials.ts';
