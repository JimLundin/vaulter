// A contract: what one extension provides and others require, by name and version, never by extension
// id (ARCHITECTURE.md, "The kernel"). A contract package in contracts/ exports one handle made here.
//
// Every extension runs in the kernel's page, and a call between two of them goes through a kernel
// handle (kernel.ts). The interface is the contract: the provider implements it and a requirer calls
// it, and TypeScript checks both sides in the editor and in CI, so the kernel doesn't check arguments.
// Every method is async and takes plain values where it can, so a provider could live elsewhere later
// (behind a network, in a WebAssembly module). A contract says where a method's guarded function sits
// (`guards`), taken from the provider's copy of the contract.
//
// A contract's version is one number: a change that breaks requirers is a new version, `records@2`,
// and a provider may offer both while they move over. Anything else is the same version: contracts
// and extensions ship together, and CI checks them against each other.
import { z } from 'zod';
import type { GuardSpec } from './access.ts';

export const ContractName = z.string().regex(/^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*)*$/, {
  message: 'lowercase words joined by dots, such as "records" or "agent.tools"',
});
/** An extension's version: major.minor.patch, for people reading the extensions list. */
export const Version = z
  .string()
  .regex(/^\d+\.\d+\.\d+$/, { message: 'major.minor.patch, such as "1.2.0"' });
const ContractVersion = z.number().int().positive();

/** Where each method's guarded function is (access.ts). */
export type Guards<T> = { [M in keyof T]?: GuardSpec };

export interface Contract<T> {
  readonly kind: 'contract';
  readonly name: string;
  readonly version: number;
  /** `name@version`: what a `requires` asks for and a `provides` satisfies. */
  readonly key: string;
  readonly guards: Guards<T>;
  /** Methods only a person may call: the kernel lets a call through only right after a gesture
   * (a tap or a key), so no extension, Vaulter included, can call them on its own. */
  readonly personal: readonly string[];
  /** Only for the types: never set at runtime. */
  readonly _interface?: T;
}

/** A contract, whatever its interface. */
export type AnyContract = Contract<unknown>;
/** The contract's interface: what a provider implements and a requirer is handed. */
export type InterfaceOf<C> = C extends Contract<infer T> ? T : never;

export function defineContract<T>(def: {
  name: string;
  version: number;
  guards?: Guards<T>;
  personal?: (keyof T & string)[];
}): Contract<T> {
  const name = ContractName.parse(def.name);
  const version = ContractVersion.parse(def.version);
  return Object.freeze({
    kind: 'contract',
    name,
    version,
    key: `${name}@${version}`,
    guards: def.guards ?? {},
    personal: Object.freeze([...(def.personal ?? [])]),
  });
}

/** A contract as the static fields name it: by name and version, with its key derived from them. */
export const ContractRef = z
  .object({
    kind: z.literal('contract'),
    name: ContractName,
    version: ContractVersion,
    personal: z.array(z.string()).default([]),
  })
  .transform((c) => ({ ...c, key: `${c.name}@${c.version}` }));
export type ContractRef = z.output<typeof ContractRef>;
