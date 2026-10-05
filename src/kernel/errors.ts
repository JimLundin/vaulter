// What went wrong, and in which extension: an extension that failed to start, and errors nothing
// caught, kept under the extension whose code threw. Its stack says whose: in the build each
// extension's code is in its own chunk (assets/ext/<id>.<hash>.js), and in dev and tests its files
// are extensions/<id>/…. The last few per extension are kept, for this run, for the extensions list.

export interface ErrorEntry {
  at: string;
  where: 'start' | 'uncaught';
  message: string;
  stack?: string;
}

const KEEP = 20;

/** The extension a stack points into first, if any. */
export const blame = (stack: string | undefined) =>
  stack && /\/ext(?:ensions)?\/([a-z][a-z0-9-]*)[/.]/.exec(stack)?.[1];

const byExt = new Map<string, ErrorEntry[]>();

export function record(ext: string, where: ErrorEntry['where'], err: unknown) {
  const e = err as Error | undefined;
  const entry: ErrorEntry = {
    at: new Date().toISOString(),
    where,
    message: e?.message ?? String(err),
    ...(e?.stack ? { stack: e.stack } : {}),
  };
  byExt.set(ext, [...(byExt.get(ext) ?? []), entry].slice(-KEEP));
}

/** An uncaught error or rejection: kept under the extension its stack points into. */
export function uncaught(err: unknown) {
  const ext = blame((err as Error | undefined)?.stack);
  if (ext) record(ext, 'uncaught', err);
  return ext;
}

export const errorsOf = (ext: string) => [...(byExt.get(ext) ?? [])];
