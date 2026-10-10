/** The memory adapter's shared queue, including cancellation while waiting. */
export function serial() {
  let pending: Promise<unknown> = Promise.resolve();
  return <T>(operation: () => Promise<T>, signal?: AbortSignal): Promise<T> => {
    const run = pending.then(() => {
      signal?.throwIfAborted();
      return operation();
    });
    pending = run.catch(() => undefined);
    return cancellable(run, signal);
  };
}

/** Cancel waiting without trusting the producer to respond to its signal. */
export function cancellable<T>(work: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return work;
  return new Promise<T>((resolve, reject) => {
    const cleanup = () => signal.removeEventListener('abort', abort);
    const abort = () => {
      cleanup();
      reject(signal.reason);
    };
    signal.addEventListener('abort', abort, { once: true });
    work
      .then(
        (value) => {
          cleanup();
          resolve(value);
        },
        (error: unknown) => {
          cleanup();
          reject(error);
        },
      )
      .catch(reject);
    if (signal.aborted) abort();
  });
}

/** Shared by every tab using this origin's encrypted cache. Never fall back to a tab-local lock. */
export const browserWrites = <T>(operation: () => Promise<T>, signal?: AbortSignal): Promise<T> => {
  if (typeof navigator === 'undefined' || !navigator.locks)
    return Promise.reject(new Error('This browser cannot coordinate vault writes safely.'));
  return navigator.locks.request('vault-github:writes', { signal }, operation);
};

/** Sync and writes also serialize cache replacement. Read-only browsers may still read the vault. */
export const browserCache = <T>(operation: () => Promise<T>): Promise<T> =>
  typeof navigator !== 'undefined' && navigator.locks
    ? navigator.locks.request('vault-github:cache', operation)
    : operation();
