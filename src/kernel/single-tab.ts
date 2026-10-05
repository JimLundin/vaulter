// One tab at a time: two would share the same IndexedDB with listeners that never hear of each other's
// changes. The first tab holds a Web Lock for as long as it is open; another finds it taken and stays
// empty.
const LOCK = 'vaulter';

/** Whether this tab has Vaulter: yes if no other tab has it, and then this one keeps it until it
 * closes. */
export const claim = (locks: LockManager = navigator.locks) =>
  new Promise<boolean>((ok) => {
    void locks.request(LOCK, { ifAvailable: true }, (lock) => {
      ok(lock !== null);
      return lock ? new Promise<void>(() => undefined) : undefined;
    });
  });
