// What went wrong, and in which extension: errors thrown through a handle (a call, a callback, setup or
// a stop) are kept by the kernel under the extension whose code threw, and so are uncaught ones, traced
// by the source URL every compiled module carries (pip:///<commit>/extensions/<id>/…, link.ts). The last
// few per extension are kept, for safe mode and the extensions list.
import type { KernelStorage } from './storage.ts';

export interface ErrorEntry {
  at: string;
  /** Where it surfaced. */
  where: 'setup' | 'call' | 'callback' | 'stop' | 'uncaught';
  message: string;
  stack?: string;
}

const KEEP = 20;
/** This many in a minute and an extension is shown as failing. */
const FAILING = 5;

/** The extension a stack trace points into, if any. */
export function extensionIn(stack: string | undefined): string | undefined {
  return stack && /pip:\/\/\/[^/\s]+\/extensions\/([^/\s]+)\//.exec(stack)?.[1];
}

export class ErrorLog {
  private readonly byExt = new Map<string, ErrorEntry[]>();
  private readonly storage?: KernelStorage;
  private loaded?: Promise<void>;

  constructor(storage?: KernelStorage) {
    this.storage = storage;
  }

  /** Errors from earlier runs, so safe mode can show why the last start went wrong. */
  load() {
    this.loaded ??= (async () => {
      const kept = (await this.storage?.get('kernel', 'errors')) as
        | Record<string, ErrorEntry[]>
        | undefined;
      for (const [id, list] of Object.entries(kept ?? {}))
        this.byExt.set(id, [...list, ...(this.byExt.get(id) ?? [])].slice(-KEEP));
    })();
    return this.loaded;
  }

  record(ext: string, where: ErrorEntry['where'], err: unknown) {
    const e = err as Error | undefined;
    const entry: ErrorEntry = {
      at: new Date().toISOString(),
      where,
      message: e?.message ?? String(err),
      ...(e?.stack ? { stack: e.stack } : {}),
    };
    this.byExt.set(ext, [...(this.byExt.get(ext) ?? []), entry].slice(-KEEP));
    void this.storage
      ?.set('kernel', 'errors', Object.fromEntries(this.byExt))
      .catch(() => undefined);
  }

  /** An uncaught error or rejection: kept under the extension its stack points into. */
  uncaught(err: unknown): string | undefined {
    const ext = extensionIn((err as Error | undefined)?.stack);
    if (ext) this.record(ext, 'uncaught', err);
    return ext;
  }

  of = (ext: string) => [...(this.byExt.get(ext) ?? [])];

  failing(ext: string) {
    const since = new Date(Date.now() - 60_000).toISOString();
    return (this.byExt.get(ext) ?? []).filter((e) => e.at >= since).length >= FAILING;
  }
}
