// A contract: what one extension provides and others require, by name and version, never by extension
// id (ARCHITECTURE.md, "The kernel"). A contract package in contracts/ exports one handle made here.
//
// Every extension runs in the kernel's page, and a call between two of them goes through a kernel
// handle (kernel.ts). A contract has two faces:
//   W, the wire face (hence `RecordsWire`, `AgentToolsWire`): what a provider implements. Every
//     method is async and takes plain values where it can, so a provider could live elsewhere later
//     (behind a network, in a WebAssembly module).
//   T, what a requirer uses: by default the same as W; a contract with a `client` adapts W into T on
//     the requirer's side (records turns Zod schemas into JSON Schema there, so registerType can
//     return a typed handle at once).
// `inputs` are Zod schemas for W's methods, taken from the provider's copy of the contract and checked
// by the handle before every call.
import { z } from 'zod';

const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/;

export const ContractName = z.string().regex(/^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*)*$/, {
  message: 'lowercase words joined by dots, such as "records" or "agent.tools"',
});
export const Version = z.string().regex(SEMVER, { message: 'major.minor.patch, such as "1.2.0"' });

/** A method's arguments, as one tuple schema. */
export type Inputs<W> = { [M in keyof W]?: z.ZodType<unknown[]> };

export interface ClientInfo {
  /** The id of the extension the client runs for. */
  caller: string;
}

export interface Contract<T, W = T> {
  readonly kind: 'contract';
  readonly name: string;
  readonly version: string;
  /** `name@major`: what a `requires` asks for and a `provides` satisfies. */
  readonly key: string;
  readonly inputs: Inputs<W>;
  /** Methods only a person may call: the kernel lets a call through only right after a gesture
   * (a tap or a key), so no extension, Pip included, can call them on its own. */
  readonly personal: readonly string[];
  readonly client?: (remote: W, info: ClientInfo) => T;
  /** Only for the types: never set at runtime. */
  readonly _use?: T;
  readonly _wire?: W;
}

// biome-ignore lint/suspicious/noExplicitAny: a contract of any interface
export type AnyContract = Contract<any, any>;
/** What a provider of the contract implements. */
export type Impl<C> = C extends Contract<infer _T, infer W> ? W : never;
/** What a requirer of the contract is handed. */
export type Use<C> = C extends Contract<infer T, infer _W> ? T : never;

export function defineContract<T, W = T>(def: {
  name: string;
  version: string;
  inputs?: Inputs<W>;
  personal?: (keyof W & string)[];
  client?: (remote: W, info: ClientInfo) => T;
}): Contract<T, W> {
  const name = ContractName.parse(def.name);
  const version = Version.parse(def.version);
  return Object.freeze({
    kind: 'contract',
    name,
    version,
    key: keyOf(name, version),
    inputs: def.inputs ?? {},
    personal: Object.freeze([...(def.personal ?? [])]),
    client: def.client,
  });
}

const parts = (v: string) => v.split('.').map(Number) as [number, number, number];
export const major = (v: string) => parts(v)[0];
export const keyOf = (name: string, version: string) => `${name}@${major(version)}`;

/** A contract as the static fields name it: by name and version, with its key derived from them. */
export const ContractRef = z
  .object({
    kind: z.literal('contract'),
    name: ContractName,
    version: Version,
    personal: z.array(z.string()).default([]),
  })
  .transform((c) => ({ ...c, key: keyOf(c.name, c.version) }));
export type ContractRef = z.output<typeof ContractRef>;

/** Whether a provider at `provided` satisfies a requirer built against `required`: the same major, and
 * at least the same minor (a minor adds methods; a requirer may use them). */
export function satisfies(provided: string, required: string): boolean {
  const [pM, pm, pp] = parts(provided);
  const [rM, rm, rp] = parts(required);
  return pM === rM && (pm > rm || (pm === rm && pp >= rp));
}
