// The broker: every call from one extension to a contract another provides passes through here. A caller
// gets a handle per contract it requires; each method call is checked against the contract's Zod inputs
// and then the gate (Pip's read, write and ask settings plug in there), and only then reaches the provider.
import type { AnyContract } from './contract.ts';

export interface Call {
  /** The calling extension's id. */
  from: string;
  /** The providing extension's id. */
  to: string;
  contract: string;
  method: string;
  args: unknown[];
}

/** Decides a call before it reaches the provider: returns (or resolves) to let it through, throws (or
 * rejects) to refuse it. An async gate makes every call it sees async. */
export type Gate = (call: Call) => void | Promise<void>;

export class Refusal extends Error {
  override name = 'Refusal';
}

export function handle<T extends object>(
  impl: T,
  contract: AnyContract,
  from: string,
  to: string,
  gate: Gate,
): T {
  const wrapped = new Map<PropertyKey, unknown>();
  return new Proxy(impl, {
    get(target, m) {
      const value = Reflect.get(target, m);
      // Constants on a contract (slot names, type handles) pass as they are; methods are brokered.
      if (typeof value !== 'function' || typeof m !== 'string') return value;
      if (!wrapped.has(m))
        wrapped.set(m, (...raw: unknown[]) => {
          const schema = contract.inputs[m];
          let args = raw;
          if (schema) {
            const parsed = schema.safeParse(raw);
            if (!parsed.success)
              throw new Refusal(
                `${from} → ${contract.key}.${m}: ${parsed.error.issues.map((i) => `${i.path.join('.') || 'arguments'}: ${i.message}`).join('; ')}`,
              );
            args = parsed.data;
          }
          // Synchronous unless the gate isn't: registerType and the like return at once.
          const decided = gate({ from, to, contract: contract.key, method: m, args });
          return decided instanceof Promise
            ? decided.then(() => value.apply(target, args))
            : value.apply(target, args);
        });
      return wrapped.get(m);
    },
    set: () => false,
    defineProperty: () => false,
    deleteProperty: () => false,
  });
}
