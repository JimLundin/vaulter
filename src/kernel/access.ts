// Pip's access to what an extension offers (ARCHITECTURE.md, "Permissions per tool"). A contract's
// inputs declare where a guarded function sits (a tool's `run`) and which of its sibling fields give
// its label and level; the handle guards it while checking the inputs, so the policy applies to every
// call to it whatever the caller sent. The person's own setting for that label comes first:
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

/** A guarded function as its holder gets it: `level` is what the policy applies now, the person's
 * setting or else the declared level. */
export type Guarded<F> = F & { readonly level: Access };

// Kept here and not exported from @pip/kernel: only the inputs schema below can guard a function.
const guards = new WeakMap<object, Guard>();

export const guardOf = (fn: unknown): Guard | undefined =>
  typeof fn === 'function' ? guards.get(fn) : undefined;

/** A function, in a contract's inputs. */
export const func = <F extends (...args: never[]) => unknown>() =>
  z.custom<F>((f) => typeof f === 'function', { message: 'a function' });

/** An object in a contract's inputs whose function `fn` is guarded, with the label `label` gives it
 * and the level in its field `access`. The handle hands the provider a new function carrying the
 * guard; the caller's own function is never marked. */
export function guardedObject<
  S extends z.ZodRawShape,
  K extends keyof S & string,
  A extends keyof S & string,
>(shape: S, opts: { fn: K; access: A; label: (value: z.output<z.ZodObject<S>>) => string }) {
  return z.object(shape).transform((value) => {
    const fields = value as Record<string, unknown>;
    const fn = fields[opts.fn] as (...args: unknown[]) => unknown;
    const guard: Guard = { label: opts.label(value), access: Access.parse(fields[opts.access]) };
    const run = (...args: unknown[]) => fn(...args);
    guards.set(run, guard);
    return { ...value, [opts.fn]: run } as z.output<z.ZodObject<S>>;
  });
}
