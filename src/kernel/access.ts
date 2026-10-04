// Vaulter's access to what an extension offers (ARCHITECTURE.md, "Permissions per tool"). A contract says
// where a guarded function sits in a method's arguments (a tool's `run`) and how to read its label and
// level from the argument it is in; the handle guards it, so the policy applies to every call to it
// whatever the caller sent. The person's own setting for that label comes first:
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

/** Where a method's guarded function is: in its argument `arg` (an object), the function `fn`, with
 * the guard `guard` reads from that object. */
export interface GuardSpec {
  arg: number;
  fn: string;
  // biome-ignore lint/suspicious/noExplicitAny: the argument's type is the contract's
  guard: (value: any) => Guard;
}

/** `args` with the function `spec` names replaced by `wrap`'s guarded one. */
export function applyGuard(
  args: unknown[],
  spec: GuardSpec,
  wrap: (fn: (...a: unknown[]) => unknown, guard: Guard) => unknown,
): unknown[] {
  const value = args[spec.arg] as Record<string, unknown> | undefined;
  const fn = value?.[spec.fn];
  if (typeof fn !== 'function')
    throw new Error(`argument ${spec.arg}: "${spec.fn}" is not a function`);
  const { label, access } = spec.guard(value);
  const out = [...args];
  out[spec.arg] = {
    ...value,
    [spec.fn]: wrap(fn as (...a: unknown[]) => unknown, {
      label: String(label),
      access: Access.parse(access),
    }),
  };
  return out;
}
