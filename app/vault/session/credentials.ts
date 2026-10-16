import type { Secrets } from './sealed.ts';
import type { SecretOverrides } from './unlock.ts';

/** Safe credential state and tasks; the stored value never leaves the Session interface. */
export interface Credential {
  readonly configured: boolean;
  readonly overridden: boolean;
  readonly persistent: boolean;
  readonly disabledReason?: string;
  readonly save: (value: string) => Promise<void>;
  readonly restore: () => Promise<void>;
  /** Required credentials cannot be cleared. */
  readonly clear?: () => Promise<void>;
}

export type SessionCredentials = Readonly<Record<keyof Secrets, Credential>>;

interface CredentialSource {
  readonly secrets: Secrets | null;
  readonly secretOverrides: SecretOverrides;
  readonly credentialPending?: boolean;
  readonly updateSecret: (key: keyof Secrets, value: string | null | undefined) => Promise<void>;
}

/** The same owner projection supports a live Session and supplied preview/test sessions. */
export function createSessionCredentials(
  source: CredentialSource,
  options: {
    readonly persistent: boolean;
    readonly disabledReason?: string;
    /** Execution rereads admission independently of the rendered projection. */
    readonly read?: () => CredentialSource;
  },
): SessionCredentials {
  const unavailable = (current: CredentialSource) =>
    current.credentialPending
      ? 'Credentials are being updated. Wait for the update to finish.'
      : (options.disabledReason ??
        (!current.secrets ? 'Unlock your login to change credentials.' : undefined));
  const disabledReason = unavailable(source);
  const credential = (key: keyof Secrets): Credential => {
    const change = (value: string | null | undefined) => {
      try {
        const current = options.read?.() ?? source;
        const reason = unavailable(current);
        if (reason) return Promise.reject(new Error(reason));
        return current.updateSecret(key, value);
      } catch (error) {
        return Promise.reject(error);
      }
    };
    return Object.freeze({
      configured: Boolean(source.secrets?.[key]),
      overridden: Object.hasOwn(source.secretOverrides, key),
      persistent: options.persistent,
      disabledReason,
      save: (value: string) => {
        const replacement = value.trim();
        if (!replacement) return Promise.reject(new Error('Enter a credential value.'));
        return change(replacement);
      },
      restore: () => change(undefined),
      ...(key !== 'github' ? { clear: () => change(null) } : {}),
    });
  };
  return Object.freeze({
    github: credential('github'),
    openai: credential('openai'),
  });
}

/** Application supplies application restrictions without interpreting credential state or tasks. */
export function restrictSessionCredentials(
  credentials: SessionCredentials,
  reason?: string | (() => string | undefined),
): SessionCredentials {
  if (!reason) return credentials;
  const currentReason = () => (typeof reason === 'function' ? reason() : reason);
  const displayedReason = currentReason();
  const restrict = (credential: Credential): Credential => {
    const disabledReason = credential.disabledReason ?? displayedReason;
    const run = (action: () => Promise<void>) => {
      try {
        const unavailable = currentReason();
        if (unavailable) return Promise.reject(new Error(unavailable));
        return action();
      } catch (error) {
        return Promise.reject(error);
      }
    };
    return Object.freeze({
      ...credential,
      disabledReason,
      save: (value: string) => run(() => credential.save(value)),
      restore: () => run(credential.restore),
      ...(credential.clear ? { clear: () => run(credential.clear!) } : {}),
    });
  };
  return Object.freeze({
    github: restrict(credentials.github),
    openai: restrict(credentials.openai),
  });
}
