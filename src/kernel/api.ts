// What extensions and contracts import, as `@vaulter/kernel`. The page has one copy of this module,
// shared by every extension.
// biome-ignore-all lint/performance/noBarrelFile: this is the public surface, one import for authors
export type { Access, Guard, Guarded, GuardSpec } from './access.ts';
export { type Asserts, type Check, defineConformance, type Suite } from './conformance.ts';
export {
  type Contract,
  defineContract,
  type Guards,
  type Inputs,
  type InterfaceOf,
} from './contract.ts';
export {
  defineExtension,
  type Extension,
  type FetchInit,
  type KernelApi,
} from './extension.ts';
export { type PerCaller, perCaller } from './per-caller.ts';
export { Declined } from './policy.ts';
export { KERNEL_API } from './version.ts';
