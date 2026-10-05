// The network with secrets: a request to one of the caller's declared hosts, with one of its declared
// secrets attached by the provider, so no extension handles a key itself (ARCHITECTURE.md, "Secrets").
// An extension declares its secrets and hosts in its about.ts, and hands them over with its id when it
// takes its own net: `netFor(id, about)`.

/** A request through `fetch`. */
export interface FetchInit {
  method?: string;
  headers?: Record<string, string>;
  body?: string | ArrayBuffer | Uint8Array | Blob | FormData | URLSearchParams;
  /** One of the caller's declared secrets: attached by the provider, never seen by the caller. */
  secret?: string;
}

export interface SecretInfo {
  extension: string;
  name: string;
  set: boolean;
}

export interface Net {
  /** https only, to the caller's declared hosts; a secret only for the hosts declared with it. */
  fetch: (url: string, init?: FetchInit) => Promise<Response>;
  /** Whether one of the caller's declared secrets is set, without revealing it. */
  hasSecret: (name: string) => Promise<boolean>;
  /** Which of these extensions' secrets are set: for the settings screen. */
  secrets: (of: { extension: string; name: string }[]) => Promise<SecretInfo[]>;
  /** Whether the page carries sealed secrets this device hasn't opened yet. */
  sealed: () => Promise<{ present: boolean; locked: boolean }>;

  // For the settings screen.
  setSecret: (ext: string, name: string, value: string) => Promise<void>;
  forgetSecret: (ext: string, name: string) => Promise<void>;
  /** Opens the page's sealed secrets with the password and keeps them on this device. */
  unlock: (password: string) => Promise<void>;
}
