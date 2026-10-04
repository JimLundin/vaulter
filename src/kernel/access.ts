// Pip's access to what an extension offers (ARCHITECTURE.md, "Permissions per tool"). An extension marks
// a function it hands out (a tool's `run`) with a label and a level; the kernel routes every call to it
// and applies the level, or the person's own setting for that label, before the call reaches it:
//   read   goes through
//   write  goes through and is logged, so it can be undone
//   ask    waits until the person approves it
import { z } from 'zod';

export const Access = z.enum(['read', 'write', 'ask']);
export type Access = z.infer<typeof Access>;

export interface Guard {
  /** Unique within the extension: "tool:mergeEntities". */
  label: string;
  access: Access;
}

const GUARD = Symbol.for('pip.guard');

/** Marks `fn` so the kernel applies `access` to every call that reaches it through a handle. */
export function guarded<F extends (...args: never[]) => unknown>(fn: F, guard: Guard): F {
  Object.defineProperty(fn, GUARD, {
    value: { label: guard.label, access: Access.parse(guard.access) },
  });
  return fn;
}

export const guardOf = (fn: unknown): Guard | undefined =>
  (fn as { [GUARD]?: Guard } | undefined)?.[GUARD];
