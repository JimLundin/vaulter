// The network with secrets: a request with one of the caller's declared secrets attached by the
// secrets extension, only to the hosts declared for it, so no extension handles a key itself
// (ARCHITECTURE.md, "Secrets"). An extension names its secrets and their hosts when it takes its own
// net: `netFor('openai', { key: ['api.openai.com'] })`.

/** A request through `fetch`. */
export interface FetchInit {
  method?: string;
  headers?: Record<string, string>;
  body?: string | ArrayBuffer | Uint8Array | Blob | FormData | URLSearchParams;
  /** One of the caller's declared secrets: attached here, never seen by the caller. */
  secret?: string;
}

export interface Net {
  /** https only; a secret only to the hosts declared for it. */
  fetch: (url: string, init?: FetchInit) => Promise<Response>;
}
