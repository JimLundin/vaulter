// What went wrong, and in which extension: errors thrown through a handle (a call, a guarded callback,
// setup) and uncaught ones are kept by the kernel under the extension whose code threw, traced by the
// source URL every compiled module carries (pip:///<commit>/extensions/<id>/…, link.ts). The last
// few per extension are kept, for safe mode and the extensions list.
import type { KernelKeep } from './storage.ts';

export interface ErrorEntry {
  at: string;
  /** Where it surfaced. */
  where: 'setup' | 'call' | 'callback' | 'uncaught';
  message: string;
  stack?: string;
}

const KEEP = 20;

/** The extension a stack trace points into, if any. */
export function extensionIn(stack: string | undefined): string | undefined {
  return stack && /pip:\/\/\/[^/\s]+\/extensions\/([^/\s]+)\//.exec(stack)?.[1];
}

export class ErrorLog {
  private readonly byExt = new Map<string, ErrorEntry[]>();
  private readonly keep?: KernelKeep;
  private readonly locate?: (stack: string) => string | undefined;
  private loaded?: Promise<void>;

  /** `locate` finds an extension in a stack by its modules' URLs, where the source URL isn't kept. */
  constructor(keep?: KernelKeep, locate?: (stack: string) => string | undefined) {
    this.keep = keep;
    this.locate = locate;
  }

  /** The extension whose code `err` was thrown in, by its stack. */
  blame(err: unknown): string | undefined {
    const stack = (err as Error | undefined)?.stack;
    return stack ? (extensionIn(stack) ?? this.locate?.(stack)) : undefined;
  }

  /** Errors from earlier runs, so safe mode can show why the last start went wrong. */
  load() {
    this.loaded ??= (async () => {
      const kept = await this.keep?.get<Record<string, ErrorEntry[]>>('errors');
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
    void this.keep?.set('errors', Object.fromEntries(this.byExt)).catch(() => undefined);
  }

  /** An uncaught error or rejection: kept under the extension its stack points into. */
  uncaught(err: unknown): string | undefined {
    const ext = this.blame(err);
    if (ext) this.record(ext, 'uncaught', err);
    return ext;
  }

  of = (ext: string) => [...(this.byExt.get(ext) ?? [])];
}
