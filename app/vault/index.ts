// The Vault exposes its EAV session and credential controls.
export { useSession as useVaultSession } from './session/session.ts';
export type { OpenEav } from './session/adapters.ts';
export { VaultGate } from './Gate.tsx';
export { CredentialSetting, RefreshVault, SessionStatus, SignOut, Unlock } from './session/ui.tsx';
export {
  createSessionCredentials,
  restrictSessionCredentials,
  type Credential,
  type SessionCredentials,
} from './session/credentials.ts';
