// Person presence: the kernel's knowledge that a person just acted in a particular extension, the
// condition for a contract's personal methods (ARCHITECTURE.md, "Personal methods"). An extension
// wraps its event handlers with `kernel.asPerson`; a trusted event (a tap or a key, not one made by
// code) grants that extension one personal call, while the browser still counts the gesture as
// recent and for a few seconds at most. A second personal call needs a second tap.
export interface Presence {
  /** A person acted in `ext`'s screen just now. */
  grant: (ext: string) => void;
  /** Whether `ext` may make one personal call now; using it up if so. */
  take: (ext: string) => boolean;
}

export const GESTURE_MS = 5000;

/** In the browser `active` is navigator.userActivation.isActive; tests pass their own, and a clock. */
export function presence(active: () => boolean, now: () => number = Date.now): Presence {
  const granted = new Map<string, number>();
  return {
    grant: (ext) => {
      granted.set(ext, now());
    },
    take: (ext) => {
      const at = granted.get(ext);
      granted.delete(ext);
      return at !== undefined && now() - at <= GESTURE_MS && active();
    },
  };
}

/** `handler`, granting `ext` presence first whenever the event is a person's own. */
export function asPerson<A extends [{ isTrusted?: boolean } | undefined, ...unknown[]], R>(
  p: Presence,
  ext: string,
  handler: (...args: A) => R,
): (...args: A) => R {
  return (...args) => {
    if (args[0]?.isTrusted === true) p.grant(ext);
    return handler(...args);
  };
}
