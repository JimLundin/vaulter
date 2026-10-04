// A contract: what one extension provides and others require, by name and version, never by extension
// id (ARCHITECTURE.md, "The kernel"). A contract package in contracts/ exports one handle made here.
//
// Every extension runs in the kernel's page, and a call between two of them goes through a kernel
// handle (kernel.ts). The interface is the contract: the provider implements it and a requirer calls
// it, and TypeScript checks both sides in the editor and in CI, so the kernel doesn't check arguments
// again. Every method is async and takes plain values where it can, so a provider could live
// elsewhere later (behind a network, in a WebAssembly module). A contract may still give Zod `inputs`
// for a method whose arguments come from outside typed code, and says where a method's guarded
// function sits (`guards`); both are taken from the provider's copy of the contract.
import { z } from 'zod';
import type { GuardSpec } from './access.ts';

const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/;

export const ContractName = z.string().regex(/^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*)*$/, {
  message: 'lowercase words joined by dots, such as "records" or "agent.tools"',
});
export const Version = z.string().regex(SEMVER, { message: 'major.minor.patch, such as "1.2.0"' });

/** A method's arguments, as one tuple schema. */
export type Inputs<T> = { [M in keyof T]?: z.ZodType<unknown[]> };
/** Where each method's guarded function is (access.ts). */
export type Guards<T> = { [M in keyof T]?: GuardSpec };

export interface Contract<T> {
  readonly kind: 'contract';
  readonly name: string;
  readonly version: string;
  /** `name@major`: what a `requires` asks for and a `provides` satisfies. */
  readonly key: string;
  readonly inputs: Inputs<T>;
  readonly guards: Guards<T>;
  /** Methods only a person may call: the kernel lets a call through only right after a gesture
   * (a tap or a key), so no extension, Pip included, can call them on its own. */
  readonly personal: readonly string[];
  /** Only for the types: never set at runtime. */
  readonly _interface?: T;
}

// biome-ignore lint/suspicious/noExplicitAny: a contract of any interface
export type AnyContract = Contract<any>;
/** The contract's interface: what a provider implements and a requirer is handed. */
export type InterfaceOf<C> = C extends Contract<infer T> ? T : never;

export function defineContract<T>(def: {
  name: string;
  version: string;
  inputs?: Inputs<T>;
  guards?: Guards<T>;
  personal?: (keyof T & string)[];
}): Contract<T> {
  const name = ContractName.parse(def.name);
  const version = Version.parse(def.version);
  return Object.freeze({
    kind: 'contract',
    name,
    version,
    key: keyOf(name, version),
    inputs: def.inputs ?? {},
    guards: def.guards ?? {},
    personal: Object.freeze([...(def.personal ?? [])]),
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
