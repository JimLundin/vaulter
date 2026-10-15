/** A shared in-process queue, including cancellation while waiting. */
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
