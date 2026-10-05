// An extension: one `defineExtension({...})` per folder in extensions/. Its static fields are plain values
// the kernel validates before any of its code runs; `setup` runs once they are accepted, with handles
// only for the contracts it requires (ARCHITECTURE.md, "The extension format").
import { z } from 'zod';
import {
  type AnyContract,
  ContractName,
  ContractRef,
  type InterfaceOf,
  Version,
} from './contract.ts';
import type { PerCaller } from './per-caller.ts';

const refs = z.record(z.string().regex(/^[a-zA-Z_$][\w$]*$/), ContractRef);

const Host = z
  .string()
  .regex(/^[a-z0-9.-]+\.[a-z]{2,}$/, { message: 'a host name, such as api.openai.com' });

/** A secret the extension needs, and the only hosts the kernel attaches it for. */
export const SecretSpec = z.object({
  label: z.string().min(1),
  hosts: z.array(Host).min(1),
});
export type SecretSpec = z.infer<typeof SecretSpec>;

export const Statics = z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]*$/, { message: 'lowercase words joined by dashes' }),
  version: Version,
  requires: refs.default({}),
  /** Contracts it uses when something provides them, and starts without otherwise: tools for Vaulter
   * when an agent is installed, questions when there is somewhere to ask. */
  optional: refs.default({}),
  provides: refs.default({}),
  permissions: z
    .object({
      device: z.array(z.enum(['microphone', 'camera', 'geolocation'])).default([]),
      /** Hosts it may fetch without a secret. */
      network: z.array(Host).default([]),
    })
    .default({ device: [], network: [] }),
  secrets: z.record(ContractName, SecretSpec).default({}),
  /** When Vaulter should use it; one line at most is always in Vaulter's context. */
  agentGuide: z.string().default(''),
  author: z
    .discriminatedUnion('kind', [
      z.object({ kind: z.literal('person') }),
      z.object({ kind: z.literal('agent'), reason: z.string().min(1) }),
    ])
    .default({ kind: 'person' }),
});
export type Statics = z.infer<typeof Statics>;

/** What the kernel gives every extension besides its contracts. The network with secrets is net@1's,
 * data is records@1's. */
export interface KernelApi {
  /** Wraps an event handler of the extension's own screen: a person's tap or key on it lets this
   * extension make one personal call (approving, answering) within a few seconds. */
  asPerson: <A extends [{ isTrusted?: boolean } | undefined, ...unknown[]], R>(
    handler: (...args: A) => R,
  ) => (...args: A) => R;
}

type Contracts = Record<string, AnyContract>;
export type Ctx<R extends Contracts, O extends Contracts = Record<never, never>> = {
  [K in keyof R]: InterfaceOf<R[K]>;
} & { [K in keyof O]: InterfaceOf<O[K]> | undefined };
/** What setup returns for each contract it provides: the implementation, or one per caller. */
export type Provided<P extends Contracts> = {
  [K in keyof P]: InterfaceOf<P[K]> | PerCaller<InterfaceOf<P[K]>>;
};
// biome-ignore lint/suspicious/noConfusingVoidType: a setup that provides nothing returns nothing
type SetupResult<P extends Contracts> = keyof P extends never ? void : Provided<P>;

export interface ExtensionDef<
  R extends Contracts,
  P extends Contracts,
  O extends Contracts = Record<never, never>,
> extends Omit<z.input<typeof Statics>, 'requires' | 'provides' | 'optional'> {
  requires?: R;
  optional?: O;
  provides?: P;
  setup: (ctx: Ctx<R, O>, kernel: KernelApi) => SetupResult<P> | Promise<SetupResult<P>>;
}

export interface Extension {
  readonly kind: 'extension';
  readonly def: ExtensionDef<Contracts, Contracts, Contracts>;
}

/** The default export of an extension's index.ts. Validation happens when the kernel loads it, so a
 * bad definition is a problem the kernel reports, not an exception at import. */
export function defineExtension<
  R extends Contracts = Record<never, never>,
  P extends Contracts = Record<never, never>,
  O extends Contracts = Record<never, never>,
>(def: ExtensionDef<R, P, O>): Extension {
  return {
    kind: 'extension',
    def: def as unknown as ExtensionDef<Contracts, Contracts, Contracts>,
  };
}

/** The static fields as plain values: contracts by name, version and personal methods. */
function staticsOf(def: Extension['def']) {
  const named = (m: Record<string, AnyContract> | undefined) =>
    Object.fromEntries(
      Object.entries(m ?? {}).map(([as, c]) => [
        as,
        { kind: c?.kind, name: c?.name, version: c?.version, personal: c?.personal },
      ]),
    );
  const { id, version, permissions, secrets, agentGuide, author } = def;
  return {
    id,
    version,
    requires: named(def.requires),
    optional: named(def.optional),
    provides: named(def.provides),
    permissions,
    secrets,
    agentGuide,
    author,
  };
}

/** The static fields of the extension in `folder` (extensions/<folder>), validated: what the kernel and
 * the review screen read before any of its code runs. Throws every problem at once. */
export function readStatics(folder: string, def: Extension['def']): Statics {
  const parsed = Statics.safeParse(staticsOf(def));
  if (!parsed.success)
    throw new Error(
      parsed.error.issues
        .map((i) => `${i.path.join('.') || 'definition'}: ${i.message}`)
        .join('; '),
    );
  if (parsed.data.id !== folder)
    throw new Error(`its id is "${parsed.data.id}"; it must be its folder's name`);
  // The kernel's own name as a caller.
  if (parsed.data.id === 'kernel') throw new Error('"kernel" is the kernel\'s own id');
  return parsed.data;
}
