// What extensions and contracts import, as `@pip/kernel`: the bundled kernel shares this one module with
// everything it compiles, so a handle made here is the same object everywhere.
export { defineContract, type Contract, type Impl, type Inputs } from './contract.ts';
export { defineExtension, type Extension, type KernelApi } from './extension.ts';
export { perCaller, type PerCaller } from './per-caller.ts';
