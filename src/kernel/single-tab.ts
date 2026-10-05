// One tab at a time. Two tabs would share one IndexedDB without hearing of
// each other's changes, so the first holds a Web Lock while it is open.

const LOCK = 'vaulter';

/** Whether this tab has Vaulter. It does if no other tab has it, and keeps
 * it until it closes. */
export function claim(locks: LockManager = navigator.locks) {
    return new Promise<boolean>((resolve) => {
        void locks.request(LOCK, { ifAvailable: true }, (lock) => {
            resolve(lock !== null);
            // Held until the tab closes.
            return lock ? new Promise<void>(() => undefined) : undefined;
        });
    });
}
