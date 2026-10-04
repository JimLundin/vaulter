// What extensions and contracts import, as `@pip/kernel`. Every sandbox has one copy of this module,
// shared by everything compiled into it.
// biome-ignore-all lint/performance/noBarrelFile: this is the public surface, one import for authors
export { type Access, type Guard, guarded } from './access.ts';
export { type Asserts, type Check, defineConformance, type Suite } from './conformance.ts';
export {
  type ClientInfo,
  type Contract,
  defineContract,
  type Impl,
  type Inputs,
  type Use,
} from './contract.ts';
export {
  defineExtension,
  type Extension,
  type ExtStorage,
  type FetchInit,
  type KernelApi,
} from './extension.ts';
export { type PerCaller, perCaller } from './per-caller.ts';
