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
import { type Access, applyGuard, type Guard } from './access.ts';
import { ErrorLog } from './errors.ts';
import { type AnyContract, type Contract, ContractRef } from './contract.ts';
import { type Extension, type KernelApi, readStatics, Statics } from './extension.ts';
import { linker } from './link.ts';
import type { Plan } from './loader.ts';
import { isPerCaller, perCallerDef } from './per-caller.ts';
import { Policy } from './policy.ts';
import { asPerson, type Presence } from './presence.ts';
import { type Refused, resolve } from './resolve.ts';
import { kernelFetch, type SecretStore } from './secrets.ts';
import type { KernelKeep } from './storage.ts';

export class Refusal extends Error {
  override name = 'Refusal';
}

export interface KernelOptions {
  secrets: SecretStore;
  /** The kernel's own state: audit and error logs. */
  keep: KernelKeep;
  /** The shared modules extensions import, by specifier (@pip/kernel, zod, react…). */
  shared: Record<string, object>;
  /** A module URL for compiled code: a blob: URL in the browser, a data: URL in Node. */
  url: (code: string) => string;
  load: (url: string) => Promise<Record<string, unknown>>;
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
}

type Fn = (...args: unknown[]) => unknown;
const NOT_METHODS = new Set(Object.getOwnPropertyNames(Object.prototype));

export const KERNEL = 'kernel';

export class Kernel {
  readonly policy: Policy;
  /** The static fields of every extension that loaded, running or not. */
  readonly seen = new Map<string, Statics>();
  private readonly parties = new Map<string, Party>();
  private readonly refused = new Map<string, string[]>();
  private readonly perCallerImpls = new Map<string, object>();
  readonly errors: ErrorLog;
  private readonly opts: KernelOptions;
  private readonly link: (plan: Plan) => string;

  constructor(opts: KernelOptions) {
    this.opts = opts;
    this.policy = new Policy(opts.keep, opts.access ?? (() => ({})));
    const { link, extensionAt } = linker(opts.url, opts.shared);
    this.link = link;
    this.errors = new ErrorLog(opts.keep, extensionAt);
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
   * fields read; those the resolver accepts are set up in dependency order. (A contract's conformance
   * suite is CI's to run, against every provider in the repo: testing.ts.) */
  async start(plans: Map<string, Plan>, opts: StartOptions = {}) {
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
        this.refused.delete(a.id);
      } catch (e) {
        this.errors.record(a.id, 'setup', e);
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

  /** A caller that isn't an extension, with real handles on running providers: what a contract's
   * conformance suite runs as in CI (testing.ts), a fresh one per check. `drop` forgets what it left
   * with the providers and stops it. */
  caller(id: string) {
    const party: Party = {
      id,
      statics: Statics.parse({ id, version: '0.0.0' }),
      wiring: {},
      provided: new Map(),
    };
    this.parties.set(id, party);
    return {
      use: <T>(contract: Contract<T>, provider: string): T => {
        party.wiring[contract.key] = provider;
        return this.handle(contract, provider, id) as T;
      },
      drop: async () => {
        await this.forget(id);
        this.parties.delete(id);
      },
    };
  }

  /** Drops what `caller` left with the providers it required. */
  private async forget(caller: string) {
    const party = this.parties.get(caller);
    await Promise.all(
      Object.entries(party?.wiring ?? {}).map(async ([key, to]) => {
        const impl = this.parties.get(to)?.provided.get(key)?.impl;
        if (isPerCaller(impl)) await perCallerDef(impl).forget?.(caller);
        this.perCallerImpls.delete(`${to}\n${key}\n${caller}`);
      }),
    );
  }

  /** Removes an extension's data: what providers keep for it (its records), and its secrets. Its
   * handles refuse from then on; what it set going in the page stops with the page's next start. */
  async remove(id: string) {
    const statics = this.parties.get(id)?.statics ?? this.seen.get(id);
    await this.forget(id);
    if (id !== KERNEL) this.parties.delete(id);
    // biome-ignore lint/performance/noAwaitInLoops: a few secrets
    for (const name of Object.keys(statics?.secrets ?? {}))
      await this.opts.secrets.forget(id, name);
  }

  /** Every handle refuses from now on: before the page goes (another tab takes over), and in tests.
   * Nothing is stopped one by one; the page's next start is the clean slate. */
  dispose() {
    this.parties.clear();
  }

  running = () =>
    [...this.parties.values()]
      .filter((p) => p.id !== KERNEL)
      .map((p) => ({ id: p.id, statics: p.statics }));
  problems = () => new Map(this.refused);

  /** A handle on a running provider of `contract`, for the kernel's own use (as "kernel"). */
  use<T>(contract: Contract<T>, provider?: string): T {
    const providers = [...this.parties.values()].filter((p) => p.provided.has(contract.key));
    const to =
      provider ?? (providers.find((p) => p.id !== KERNEL) ?? providers[0])?.id ?? undefined;
    if (!to) throw new Refusal(`nothing running provides ${contract.key}`);
    return this.handle(contract, to, KERNEL) as T;
  }

  /* ---------- Handles ---------- */

  /** What `from` holds for `contract`: the provider's implementation behind the kernel's checks. */
  private handle(contract: AnyContract, to: string, from: string): unknown {
    return new Proxy(
      {},
      {
        get: (_, method) => {
          if (typeof method !== 'string' || method === 'then') return;
          return (...args: unknown[]) => this.call(from, to, contract.key, method, args);
        },
      },
    );
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
    // Functions cross as they are, except the guarded one the contract names: it goes through the
    // policy on every call, as the provider (`to`) calling the extension that handed it over.
    const guard = contract.guards[method];
    if (guard)
      try {
        args = applyGuard(args, guard, (f, g) => this.guardedCall(f, g, from, to));
      } catch (e) {
        throw new Refusal(`${from} → ${key}.${method}: ${(e as Error).message}`);
      }
    try {
      return await (fn as Fn).apply(impl, args);
    } catch (e) {
      // Kept under whoever's code threw: the provider, or a caller's handler it ran.
      this.errors.record(this.errors.blame(e) ?? to, 'call', e);
      throw e;
    }
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
    Object.defineProperty(wrapped, 'level', { get: () => this.policy.levelOf(owner, guard) });
    return wrapped;
  }

  /* ---------- What the kernel gives every extension ---------- */

  private kernelApi(party: Party): KernelApi {
    return {
      id: party.id,
      fetch: kernelFetch(party.statics, this.opts.secrets, this.opts.fetch),
      hasSecret: async (name) =>
        name in party.statics.secrets && (await this.opts.secrets.has(party.id, name)),
      asPerson: (handler) =>
        this.opts.presence ? asPerson(this.opts.presence, party.id, handler) : handler,
    };
  }
}

/** Pip's own extensions are never a person: the agent, and any extension Pip wrote. */
const isAgent = (s: Statics | undefined) =>
  s?.author.kind === 'agent' || Object.values(s?.provides ?? {}).some((c) => c.key === 'agent@1');
