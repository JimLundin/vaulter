// The kernel: loads every extension into this page, wires each `requires` to a provider, and hands
// each extension handles that check every call (ARCHITECTURE.md, "The kernel"). Extensions run in the
// kernel's own page: there is no sandbox, so these checks keep well-behaved code, and Pip's model, in
// line; they don't contain hostile code.
//
// A handle on a contract is the provider's implementation behind a check: a personal method passes
// only right after a person acted in the caller, arguments pass the contract's Zod inputs if it has any,
// and a guarded
// function (a tool's `run`) handed across is wrapped so every call to it goes through Pip's access
// policy. Values otherwise pass as they are: no copying, so components and schemas can cross too.
import { type Access, applyGuard, type Guard, guardOf } from './access.ts';
import { ErrorLog } from './errors.ts';
import { type CheckResult, runSuite, type Suite } from './conformance.ts';
import { type AnyContract, type Contract, ContractRef } from './contract.ts';
import {
  type Extension,
  type ExtStorage,
  type KernelApi,
  readStatics,
  Statics,
} from './extension.ts';
import { linker } from './link.ts';
import type { Plan } from './loader.ts';
import { isPerCaller, perCallerDef } from './per-caller.ts';
import { Policy } from './policy.ts';
import { asPerson, type Presence } from './presence.ts';
import { type Refused, resolve } from './resolve.ts';
import { type KernelKeep, kernelFetch, type SecretStore } from './secrets.ts';
import type { KernelStorage } from './storage.ts';

export class Refusal extends Error {
  override name = 'Refusal';
}

export interface KernelOptions {
  secrets: SecretStore;
  storage: KernelStorage;
  /** The shared modules extensions import, by specifier (@pip/kernel, zod, react…). */
  shared: Record<string, object>;
  /** A module URL for compiled code: a blob: URL in the browser, a data: URL in Node. */
  url: (code: string) => string;
  load: (url: string) => Promise<Record<string, unknown>>;
  /** The kernel's own cache: conformance results. */
  keep?: KernelKeep;
  /** The person's access settings, by `extension/label`. */
  access?: () => Record<string, Access>;
  fetch?: typeof fetch;
  /** Which extension a person just acted in (presence.ts): the condition for a contract's personal
   * methods. Without it, no extension may make a personal call. */
  presence?: Presence;
}

export interface StartOptions {
  /** Contract key → extension id, where two extensions provide the same contract. */
  choose?: Record<string, string>;
  /** The plan for a contract's conformance suite (contracts/<name>/conformance.ts), if it has one. */
  conformance?: (contract: ContractRef) => Promise<Plan | null>;
}

interface Party {
  id: string;
  statics: Statics;
  /** Requires and optional: contract key → provider id. */
  wiring: Record<string, string>;
  def?: Extension['def'];
  plan?: Plan;
  /** What it provides, by contract key: its contract handle and implementation (or per caller). */
  provided: Map<string, { contract: AnyContract; impl: object }>;
  /** What to run when it stops (kernel.onStop), newest first. */
  stops?: (() => unknown)[];
}

type Fn = (...args: unknown[]) => unknown;
const NOT_METHODS = new Set(Object.getOwnPropertyNames(Object.prototype));
const WRAPPED = Symbol('pip.wrapped');
const isClass = (f: Fn) => /^class[\s{]/.test(Function.prototype.toString.call(f));

export const KERNEL = 'kernel';

export class Kernel {
  readonly policy: Policy;
  /** The static fields of every extension that loaded, running or not. */
  readonly seen = new Map<string, Statics>();
  private readonly parties = new Map<string, Party>();
  private readonly refused = new Map<string, string[]>();
  private readonly perCallerImpls = new Map<string, object>();
  /** The latest plan of every extension that loaded, for starting it again. */
  private readonly plans = new Map<string, Plan>();
  private startOpts: StartOptions = {};
  /** Wrapped functions, by the function and who owns and holds it: one wrapper each, so a function
   * handed over twice is the same function on the far side. */
  private readonly wrappers = new WeakMap<Fn, Map<string, Fn>>();
  readonly errors: ErrorLog;
  private readonly opts: KernelOptions;
  private readonly link: (plan: Plan) => string;

  constructor(opts: KernelOptions) {
    this.opts = opts;
    this.policy = new Policy(opts.storage, opts.access ?? (() => ({})));
    this.errors = new ErrorLog(opts.storage);
    this.link = linker(opts.url, opts.shared);
  }

  private kernelParty(): Party {
    let me = this.parties.get(KERNEL);
    if (!me) {
      me = {
        id: KERNEL,
        statics: Statics.parse({ id: KERNEL, version: '1.0.0' }),
        wiring: {},
        provided: new Map(),
      };
      this.parties.set(KERNEL, me);
    }
    return me;
  }

  /* ---------- Starting ---------- */

  /** Gives the kernel's own provider of a contract (the kernel contract; the dev source). */
  provide(contract: AnyContract, impl: object) {
    const ref = ContractRef.parse(contract);
    const me = this.kernelParty();
    me.statics.provides[contract.name.replaceAll('.', '_')] = ref;
    me.provided.set(ref.key, { contract, impl });
  }

  /** An extension's definition, from its plan: the module is linked and evaluated, and its static
   * fields validated, before any `setup` runs. */
  async inspect(id: string, plan: Plan): Promise<{ def: Extension['def']; statics: Statics }> {
    const ext = (await this.opts.load(this.link(plan))).default as Extension | undefined;
    if (ext?.kind !== 'extension' || typeof ext.def?.setup !== 'function')
      throw new Error('the default export is not defineExtension({...})');
    return { def: ext.def, statics: readStatics(id, ext.def) };
  }

  /** Starts the extensions in `plans` beside those already running: each is loaded and its static
   * fields read; those the resolver accepts are set up in dependency order, and a provider whose
   * contract has a conformance suite must pass it before anything that requires it starts. */
  async start(plans: Map<string, Plan>, opts: StartOptions = this.startOpts) {
    this.startOpts = opts;
    for (const [id, plan] of plans) this.plans.set(id, plan);
    const refused: Refused[] = [];
    const refuse = (id: string, problems: string[]) => {
      refused.push({ id, problems });
      this.refused.set(id, problems);
    };

    const loaded = new Map<string, { def: Extension['def']; plan: Plan }>();
    const candidates = (
      await Promise.all(
        [...plans].map(async ([id, plan]) => {
          try {
            const { def, statics } = await this.inspect(id, plan);
            this.seen.set(id, statics);
            loaded.set(id, { def, plan });
            return [{ id, statics }];
          } catch (e) {
            refuse(id, [(e as Error).message]);
            return [];
          }
        }),
      )
    ).flat();
    const res = resolve(
      candidates,
      opts.choose,
      [...this.parties.values()].map((p) => ({ id: p.id, statics: p.statics })),
    );
    for (const r of res.refused) refuse(r.id, r.problems);

    for (const a of res.accepted) {
      // An optional provider that didn't start is left out; a required one stops this one.
      for (const [as, p] of Object.entries(a.wiring))
        if (as in a.statics.optional && !this.parties.has(p)) delete a.wiring[as];
      const down = Object.values(a.wiring).filter((p) => !this.parties.has(p));
      if (down.length) {
        refuse(a.id, [`${[...new Set(down)].join(', ')} could not start`]);
        continue;
      }
      const refs = { ...a.statics.requires, ...a.statics.optional };
      const party: Party = {
        id: a.id,
        statics: a.statics,
        wiring: Object.fromEntries(Object.entries(a.wiring).map(([as, p]) => [refs[as].key, p])),
        ...loaded.get(a.id)!,
        provided: new Map(),
      };
      try {
        this.parties.set(a.id, party);
        // biome-ignore lint/performance/noAwaitInLoops: setups run in dependency order
        await this.setup(party);
        for (const c of Object.values(a.statics.provides)) {
          const suite = await opts.conformance?.(c);
          if (!suite) continue;
          const failed = (await this.conform(party, c.key, suite)).filter((r) => !r.ok);
          if (failed.length)
            throw new Error(
              `${c.key} conformance: ${failed.map((f) => `${f.name}: ${f.error}`).join('; ')}`,
            );
        }
        this.refused.delete(a.id);
      } catch (e) {
        this.errors.record(a.id, 'setup', e);
        await this.runStops(party);
        this.parties.delete(a.id);
        refuse(a.id, [`setup failed: ${(e as Error).message}`]);
      }
    }
    return {
      started: res.accepted.map((a) => a.id).filter((id) => this.parties.has(id)),
      refused,
    };
  }

  /** Runs `setup` with a handle for each contract wired, and keeps what it provides. */
  private async setup(party: Party) {
    const def = party.def!;
    const ctx: Record<string, unknown> = {};
    const wanted = { ...def.requires, ...def.optional } as Record<string, AnyContract>;
    for (const [alias, c] of Object.entries(wanted)) {
      const to = party.wiring[c.key];
      // An optional contract nothing provides is undefined in ctx.
      if (to) ctx[alias] = this.handle(c, to, party.id);
    }
    const out = (await def.setup(ctx as never, this.kernelApi(party))) as
      | Record<string, unknown>
      | undefined;
    for (const [alias, c] of Object.entries(def.provides ?? {}) as [string, AnyContract][]) {
      const impl = out?.[alias];
      if (typeof impl !== 'object' || impl === null)
        throw new Error(`provides ${c.key} as "${alias}" but setup returned nothing for it`);
      party.provided.set(c.key, { contract: c, impl });
    }
  }

  /** A conformance suite against a scratch instance of `party`: its setup run again as
   * `<id>~conformance`, so per-caller providers and storage keep it apart; what it stored is dropped
   * afterwards. A pass is cached by the shas of the provider and the suite. */
  private async conform(party: Party, key: string, suitePlan: Plan): Promise<CheckResult[]> {
    const cacheKey = `conformance:${await digest({ key, p: party.plan?.shas, s: suitePlan.shas })}`;
    if (await this.opts.keep?.get(cacheKey)) return [];
    const id = `${party.id}~conformance`;
    const scratch: Party = { ...party, id, provided: new Map() };
    this.parties.set(id, scratch);
    try {
      await this.setup(scratch);
      const suite = (await this.opts.load(this.link(suitePlan))).default as
        | Suite<unknown>
        | undefined;
      if (suite?.kind !== 'conformance') throw new Error(`${suitePlan.entry} exports no suite`);
      const { contract, impl } = scratch.provided.get(key)!;
      // Each check gets a fresh caller, so per-caller providers start it empty.
      const results = await runSuite(suite, (n) => {
        const caller = `check-${n}`;
        const i = isPerCaller(impl) ? perCallerDef(impl).make(caller) : impl;
        return contract.client ? contract.client(i as never, { caller }) : i;
      });
      if (results.every((r) => r.ok)) await this.opts.keep?.set(cacheKey, true);
      return results;
    } finally {
      await this.forget(id);
      await this.stop(id);
    }
  }

  /** Drops what `caller` left with the providers it required, and its own storage. */
  private async forget(caller: string) {
    const party = this.parties.get(caller);
    await Promise.all(
      Object.entries(party?.wiring ?? {}).map(async ([key, to]) => {
        const impl = this.parties.get(to)?.provided.get(key)?.impl;
        if (isPerCaller(impl)) await perCallerDef(impl).forget?.(caller);
        this.perCallerImpls.delete(`${to}\n${key}\n${caller}`);
      }),
    );
    await this.opts.storage.drop(caller);
  }

  /** Stops an extension, and first everything that requires it (they hold handles on it): each one's
   * onStop runs, providers let go of what it registered with them (`release`), and the functions it
   * handed out go quiet. Its data stays. Returns every extension stopped, dependants first. */
  async stop(id: string): Promise<string[]> {
    const party = this.parties.get(id);
    if (!party || id === KERNEL) return [];
    const stopped: string[] = [];
    for (const p of [...this.parties.values()])
      if (p.id !== id && Object.values(p.wiring).includes(id))
        // biome-ignore lint/performance/noAwaitInLoops: dependants stop one at a time
        stopped.push(...(await this.stop(p.id)));
    await this.runStops(party);
    await Promise.all(
      Object.entries(party.wiring).map(async ([key, to]) => {
        const impl = this.parties.get(to)?.provided.get(key)?.impl;
        try {
          if (isPerCaller(impl)) await perCallerDef(impl).release?.(id);
        } catch (e) {
          this.errors.record(to, 'stop', e);
        }
        this.perCallerImpls.delete(`${to}\n${key}\n${id}`);
      }),
    );
    this.parties.delete(id);
    stopped.push(id);
    return stopped;
  }

  private async runStops(party: Party) {
    for (const fn of party.stops ?? []) {
      try {
        // biome-ignore lint/performance/noAwaitInLoops: in order, newest first
        await fn();
      } catch (e) {
        this.errors.record(party.id, 'stop', e);
      }
    }
    party.stops = [];
  }

  /** Stops `ids` (with what requires them) and starts them all again, from `plans` where given (a
   * draft's new commit) or from the plans they last loaded with: a change without a page reload. */
  async reload(ids: string[], plans = new Map<string, Plan>()) {
    const stopped = new Set<string>();
    for (const id of ids) for (const s of await this.stop(id)) stopped.add(s);
    const again = new Map<string, Plan>();
    for (const id of new Set([...stopped, ...plans.keys()])) {
      const plan = plans.get(id) ?? this.plans.get(id);
      if (plan) again.set(id, plan);
    }
    return this.start(again);
  }

  /** Removes an extension's data: its storage, what providers keep for it, and its secrets. */
  async remove(id: string) {
    const statics = this.parties.get(id)?.statics ?? this.seen.get(id);
    await this.forget(id);
    await this.stop(id);
    // biome-ignore lint/performance/noAwaitInLoops: a few secrets
    for (const name of Object.keys(statics?.secrets ?? {}))
      await this.opts.secrets.forget(id, name);
  }

  /** Stops every extension, last started first. */
  async dispose() {
    // biome-ignore lint/performance/noAwaitInLoops: one at a time, dependants first
    for (const id of [...this.parties.keys()].reverse()) await this.stop(id);
  }

  running = () =>
    [...this.parties.values()]
      .filter((p) => p.id !== KERNEL)
      .map((p) => ({ id: p.id, statics: p.statics }));
  problems = () => new Map(this.refused);

  /** A handle on a running provider of `contract`, for the kernel's own use (as "kernel"). */
  use<T, W>(contract: Contract<T, W>, provider?: string): T {
    const providers = [...this.parties.values()].filter((p) => p.provided.has(contract.key));
    const to =
      provider ?? (providers.find((p) => p.id !== KERNEL) ?? providers[0])?.id ?? undefined;
    if (!to) throw new Refusal(`nothing running provides ${contract.key}`);
    return this.handle(contract, to, KERNEL) as T;
  }

  /* ---------- Handles ---------- */

  /** What `from` holds for `contract`: the provider's implementation behind the kernel's checks, with
   * the contract's client (from the requirer's own copy) on top. */
  private handle(contract: AnyContract, to: string, from: string): unknown {
    const remote = new Proxy(
      {},
      {
        get: (_, method) => {
          if (typeof method !== 'string' || method === 'then') return;
          return (...args: unknown[]) => this.call(from, to, contract.key, method, args);
        },
      },
    );
    return contract.client ? contract.client(remote as never, { caller: from }) : remote;
  }

  private async call(from: string, to: string, key: string, method: string, raw: unknown[]) {
    const party = this.parties.get(to);
    if (!party) throw new Refusal(`${to}, which provides ${key}, is not running`);
    if (!this.parties.has(from) && from !== KERNEL) throw new Refusal(`${from} is not running`);
    const p = party.provided.get(key);
    if (!p) throw new Refusal(`${to} does not provide ${key}`);
    const { contract } = p;
    if (contract.personal.includes(method) && from !== KERNEL) {
      if (isAgent(this.parties.get(from)?.statics))
        throw new Refusal(`${key}.${method} is for a person to do; ${from} is Pip's`);
      if (!this.opts.presence?.take(from))
        throw new Refusal(`${key}.${method} is for a person to do, right after a tap or key`);
    }
    let impl = p.impl as Record<string, unknown>;
    if (isPerCaller(impl)) {
      const k = `${to}\n${key}\n${from}`;
      if (!this.perCallerImpls.has(k)) this.perCallerImpls.set(k, perCallerDef(impl).make(from));
      impl = this.perCallerImpls.get(k) as Record<string, unknown>;
    }
    const fn = impl[method];
    if (typeof fn !== 'function' || NOT_METHODS.has(method))
      throw new Refusal(`${key} has no method "${method}"`);
    // The provider's inputs (if any) and guards first, then every function is carried across.
    let args = raw;
    const schema = contract.inputs[method];
    if (schema) {
      const parsed = schema.safeParse(args);
      if (!parsed.success)
        throw new Refusal(
          `${from} → ${key}.${method}: ${parsed.error.issues.map((i) => `${i.path.join('.') || 'arguments'}: ${i.message}`).join('; ')}`,
        );
      args = parsed.data;
    }
    const guard = contract.guards[method];
    if (guard)
      try {
        args = applyGuard(args, guard);
      } catch (e) {
        throw new Refusal(`${from} → ${key}.${method}: ${(e as Error).message}`);
      }
    args = this.carry(from, to, args) as unknown[];
    let result: unknown;
    try {
      result = await (fn as Fn).apply(impl, args);
    } catch (e) {
      this.errors.record(to, 'call', e);
      throw e;
    }
    return this.carry(to, from, result);
  }

  /** A value going from `owner` to `holder`: each function in it (in plain objects and arrays) is
   * wrapped with its owner, so it goes quiet once the owner stops and its errors are the owner's; a
   * guarded one also goes through the access policy, as `holder` calling `owner`. */
  private carry(owner: string, holder: string, v: unknown, depth = 0): unknown {
    if (depth > 20) return v;
    if (typeof v === 'function') {
      const fn = v as Fn;
      const guard = guardOf(fn);
      if (WRAPPED in fn || isClass(fn) || (owner === KERNEL && !guard)) return fn;
      const key = `${owner}\n${holder}`;
      const known = this.wrappers.get(fn)?.get(key);
      if (known) return known;
      const wrapped = guard ? this.guardedCall(fn, guard, owner, holder) : this.owned(fn, owner);
      if (!this.wrappers.has(fn)) this.wrappers.set(fn, new Map());
      this.wrappers.get(fn)!.set(key, wrapped);
      return wrapped;
    }
    if (Array.isArray(v)) return v.map((x) => this.carry(owner, holder, x, depth + 1));
    if (typeof v === 'object' && v !== null && Object.getPrototypeOf(v) === Object.prototype) {
      const out: Record<string, unknown> = {};
      for (const [k, x] of Object.entries(v)) out[k] = this.carry(owner, holder, x, depth + 1);
      return out;
    }
    return v;
  }

  /** A function of `owner`'s: once the owner stops, calling it does nothing (a handler it left with a
   * provider goes quiet); while it runs, what it throws is recorded as the owner's. Synchronous when
   * the function is, so a component or a sync callback stays one. */
  private owned(fn: Fn, owner: string): Fn {
    const kernel = this;
    const wrapped = function (this: unknown, ...args: unknown[]) {
      if (!kernel.parties.has(owner)) return;
      try {
        const out = fn.apply(this, args);
        if (out instanceof Promise)
          return out.catch((e: unknown) => {
            kernel.errors.record(owner, 'callback', e);
            throw e;
          });
        return out;
      } catch (e) {
        kernel.errors.record(owner, 'callback', e);
        throw e;
      }
    };
    Object.defineProperty(wrapped, WRAPPED, { value: true });
    Object.defineProperty(wrapped, 'name', { value: fn.name });
    return wrapped;
  }

  private guardedCall(fn: Fn, guard: Guard, owner: string, holder: string): Fn {
    this.policy.see(owner, guard);
    const wrapped = async (...args: unknown[]) => {
      if (!this.parties.has(owner)) throw new Refusal(`${owner} is not running`);
      await this.policy.admit({ from: holder, to: owner, guard, args });
      try {
        return await fn(...args);
      } catch (e) {
        this.errors.record(owner, 'callback', e);
        throw e;
      }
    };
    Object.defineProperty(wrapped, WRAPPED, { value: true });
    Object.defineProperty(wrapped, 'level', { get: () => this.policy.levelOf(owner, guard) });
    return wrapped;
  }

  /* ---------- What the kernel gives every extension ---------- */

  private kernelApi(party: Party): KernelApi {
    const s = this.opts.storage;
    const ns = party.id;
    const storage: ExtStorage = {
      get: (key) => s.get(ns, key) as never,
      set: (key, value) => s.set(ns, key, value),
      delete: (key) => s.delete(ns, key),
      list: (prefix) => s.list(ns, prefix ?? '') as never,
    };
    return {
      id: party.id,
      fetch: kernelFetch(party.statics, this.opts.secrets, this.opts.fetch),
      hasSecret: async (name) =>
        name in party.statics.secrets && (await this.opts.secrets.has(party.id, name)),
      storage,
      onStop: (fn) => {
        party.stops = [fn, ...(party.stops ?? [])];
      },
      asPerson: (handler) =>
        this.opts.presence ? asPerson(this.opts.presence, party.id, handler) : handler,
    };
  }
}

/** Pip's own extensions are never a person: the agent, and any extension Pip wrote. */
const isAgent = (s: Statics | undefined) =>
  s?.author.kind === 'agent' || Object.values(s?.provides ?? {}).some((c) => c.key === 'agent@1');

async function digest(v: unknown) {
  const bytes = new TextEncoder().encode(JSON.stringify(v));
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
    .map((x) => x.toString(16).padStart(2, '0'))
    .join('');
}
