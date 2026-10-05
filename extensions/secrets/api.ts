// The network with secrets: a request with one of the caller's declared secrets attached by the
// secrets extension, only to the hosts declared for it, so no extension handles a key itself
// (ARCHITECTURE.md, "Secrets"). An extension declares its secrets in its about.ts, and hands them over
// with its id when it takes its own net: `netFor(id, about)`.

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
