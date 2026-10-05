// What extensions and contracts import, as `#kernel`. The page has one copy of this module,
// shared by every extension.
// biome-ignore-all lint/performance/noBarrelFile: this is the public surface, one import for authors
export type { Access, Guard, Guarded, GuardSpec } from './access.ts';
export {
  type Contract,
  defineContract,
  type Guards,
  type InterfaceOf,
} from './contract.ts';
export {
  defineExtension,
  type Extension,
  type KernelApi,
  type Statics,
} from './extension.ts';
export { type PerCaller, perCaller } from './per-caller.ts';
export { Declined } from './policy.ts';
