// An extension: one `defineExtension({...})` per folder in extensions/. Its static fields are plain values
// the kernel validates before any of its code runs; `setup` runs once they are accepted, with handles
// only for the contracts it requires (ARCHITECTURE-pip.md, "The extension format").
import { z } from 'zod';
import { type AnyContract, ContractName, type Impl, Version } from './contract.ts';

const contractHandle = z.custom<AnyContract>(
  (c) => typeof c === 'object' && c !== null && (c as AnyContract).kind === 'contract',
  { message: 'not a contract handle (import it from contracts/)' },
);
const handles = z.record(z.string(), contractHandle);

const Host = z
  .string()
  .regex(/^[a-z0-9.-]+\.[a-z]{2,}$/, { message: 'a host name, such as api.openai.com' });

/** A secret the extension needs, and the only hosts the kernel attaches it for. */
export const SecretSpec = z.object({
  label: z.string().min(1),
  hosts: z.array(Host).min(1),
  /** The header it goes in, and what comes before the value. */
  header: z.string().default('Authorization'),
  prefix: z.string().default('Bearer '),
});
export type SecretSpec = z.infer<typeof SecretSpec>;

export const Statics = z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]*$/, { message: 'lowercase words joined by dashes' }),
  version: Version,
  requires: handles.default({}),
  provides: handles.default({}),
  permissions: z
    .object({
      device: z.array(z.enum(['microphone', 'camera', 'geolocation'])).default([]),
      /** Hosts it may fetch without a secret. */
      network: z.array(Host).default([]),
    })
    .default({ device: [], network: [] }),
  secrets: z.record(ContractName, SecretSpec).default({}),
  /** When Pip should use it; one line at most is always in Pip's context. */
  agentGuide: z.string().default(''),
  author: z
    .discriminatedUnion('kind', [
      z.object({ kind: z.literal('person') }),
      z.object({ kind: z.literal('agent'), reason: z.string().min(1) }),
    ])
    .default({ kind: 'person' }),
});
export type Statics = z.infer<typeof Statics>;

/** What the kernel gives every extension besides its contracts. */
export interface KernelApi {
  /** `fetch`, allowed only to the extension's declared hosts; `secret` names one of its secrets, which
   * the kernel attaches itself, so the extension never sees the value. */
  fetch: (url: string, init?: RequestInit & { secret?: string }) => Promise<Response>;
  /** A secret the extension declared is set, without revealing it. */
  hasSecret: (name: string) => Promise<boolean>;
}

type Contracts = Record<string, AnyContract>;
export type Ctx<R extends Contracts> = { [K in keyof R]: Impl<R[K]> };
export type Provided<P extends Contracts> = { [K in keyof P]: Impl<P[K]> };
// biome-ignore lint/suspicious/noConfusingVoidType: a setup that provides nothing returns nothing
type SetupResult<P extends Contracts> = keyof P extends never ? void : Provided<P>;

export interface ExtensionDef<R extends Contracts, P extends Contracts>
  extends Omit<z.input<typeof Statics>, 'requires' | 'provides'> {
  requires?: R;
  provides?: P;
  setup: (ctx: Ctx<R>, kernel: KernelApi) => SetupResult<P> | Promise<SetupResult<P>>;
}

export interface Extension {
  readonly kind: 'extension';
  readonly def: ExtensionDef<Contracts, Contracts>;
}

/** The default export of an extension's index.ts. Validation happens when the kernel loads it, so a
 * bad definition is a problem the kernel reports, not an exception at import. */
export function defineExtension<
  R extends Contracts = Record<never, never>,
  P extends Contracts = Record<never, never>,
>(def: ExtensionDef<R, P>): Extension {
  return { kind: 'extension', def: def as unknown as ExtensionDef<Contracts, Contracts> };
}
