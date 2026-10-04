// A contract: what one extension provides and others require, by name and version, never by extension
// id (ARCHITECTURE-pip.md, "The kernel"). A contract package in contracts/ exports one handle made here;
// the interface is the handle's type, and `inputs` are Zod schemas the broker checks every call against.
import { z } from 'zod';

const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/;

export const ContractName = z.string().regex(/^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*)*$/, {
  message: 'lowercase words joined by dots, such as "records" or "agent.tools"',
});
export const Version = z.string().regex(SEMVER, { message: 'major.minor.patch, such as "1.2.0"' });

/** A method's arguments, as one tuple schema. */
export type Inputs<T> = { [M in keyof T]?: z.ZodType<unknown[]> };

export interface Contract<T> {
  readonly kind: 'contract';
  readonly name: string;
  readonly version: string;
  /** `name@major`: what a `requires` asks for and a `provides` satisfies. */
  readonly key: string;
  readonly inputs: Inputs<T>;
  /** Only for the type: a contract's interface lives here, never at runtime. */
  readonly _type?: T;
}

// biome-ignore lint/suspicious/noExplicitAny: a map of contracts of any interface
export type AnyContract = Contract<any>;
export type Impl<C> = C extends Contract<infer T> ? T : never;

export function defineContract<T>(def: {
  name: string;
  version: string;
  inputs?: Inputs<T>;
}): Contract<T> {
  const name = ContractName.parse(def.name);
  const version = Version.parse(def.version);
  return Object.freeze({
    kind: 'contract',
    name,
    version,
    key: `${name}@${major(version)}`,
    inputs: def.inputs ?? {},
  });
}

const parts = (v: string) => v.split('.').map(Number) as [number, number, number];
export const major = (v: string) => parts(v)[0];

/** Whether a provider at `provided` satisfies a requirer built against `required`: the same major, and
 * at least the same minor (a minor adds methods; a requirer may use them). */
export function satisfies(provided: string, required: string): boolean {
  const [pM, pm, pp] = parts(provided);
  const [rM, rm, rp] = parts(required);
  return pM === rM && (pm > rm || (pm === rm && pp >= rp));
}
