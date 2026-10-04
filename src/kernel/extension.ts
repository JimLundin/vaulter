// An extension: one `defineExtension({...})` per folder in extensions/. Its static fields are plain values
// the kernel validates before any of its code runs; `setup` runs once they are accepted, with handles
// only for the contracts it requires (ARCHITECTURE.md, "The extension format").
import { z } from 'zod';
import {
  type AnyContract,
  ContractName,
  ContractRef,
  type Impl,
  type Use,
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
  /** The header it goes in, and what comes before the value. */
  header: z.string().default('Authorization'),
  prefix: z.string().default('Bearer '),
});
export type SecretSpec = z.infer<typeof SecretSpec>;

export const Statics = z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]*$/, { message: 'lowercase words joined by dashes' }),
  version: Version,
  /** The kernel API it was written against (version.ts): the same major, at least this minor. */
  kernel: Version.default('1.0.0'),
  requires: refs.default({}),
  /** Contracts it uses when something provides them, and starts without otherwise: tools for Pip
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

/** A request through the kernel's `fetch`. */
export interface FetchInit {
  method?: string;
  headers?: Record<string, string>;
  body?: string | ArrayBuffer | Uint8Array | Blob | FormData | URLSearchParams;
  /** One of the extension's declared secrets: the kernel attaches it, the extension never sees it. */
  secret?: string;
}

/** The extension's own storage, kept by the kernel in a namespace of its own; it goes when the
 * extension is removed. Values are anything structured clone copies. */
export interface ExtStorage {
  get: <T>(key: string) => Promise<T | undefined>;
  set: (key: string, value: unknown) => Promise<void>;
  delete: (key: string) => Promise<void>;
  /** Entries whose key starts with `prefix`, in key order. */
  list: <T>(prefix?: string) => Promise<[string, T][]>;
}

/** What the kernel gives every extension besides its contracts: storage of its own, and a fetch that
 * attaches its secrets, so no extension handles either itself. */
export interface KernelApi {
  readonly id: string;
  /** https only, to the extension's declared hosts. */
  fetch: (url: string, init?: FetchInit) => Promise<Response>;
  /** Whether a secret the extension declared is set, without revealing it. */
  hasSecret: (name: string) => Promise<boolean>;
  storage: ExtStorage;
  /** Runs when the extension stops (turned off, reloaded, removed, or the tab handed over): clear
   * timers and anything else it started. Handlers it gave other extensions go quiet on their own. */
  onStop: (fn: () => void | Promise<void>) => void;
}

type Contracts = Record<string, AnyContract>;
export type Ctx<R extends Contracts, O extends Contracts = Record<never, never>> = {
  [K in keyof R]: Use<R[K]>;
} & { [K in keyof O]: Use<O[K]> | undefined };
/** What setup returns for each contract it provides: the implementation, or one per caller. */
export type Provided<P extends Contracts> = { [K in keyof P]: Impl<P[K]> | PerCaller<Impl<P[K]>> };
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
  const refs = (m: Record<string, AnyContract> | undefined) =>
    Object.fromEntries(
      Object.entries(m ?? {}).map(([as, c]) => [
        as,
        { kind: c?.kind, name: c?.name, version: c?.version, personal: c?.personal },
      ]),
    );
  const { id, version, kernel, permissions, secrets, agentGuide, author } = def;
  return {
    id,
    version,
    kernel,
    requires: refs(def.requires),
    optional: refs(def.optional),
    provides: refs(def.provides),
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
  return parsed.data;
}
