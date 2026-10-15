/** Shared by every tab using this origin's device cache. Never fall back to a tab-local lock. */
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
