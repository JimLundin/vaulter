// The kernel: starts each extension in its own sandbox, wires every `requires` to a provider, and
// routes every message between them (ARCHITECTURE.md, "The kernel"). Nothing passes between two
// sandboxes except through `route`, which checks that the caller requires the contract, that a
// callback was handed to the caller, and Pip's access for a guarded one.
//
// Callbacks: a function in a message becomes a reference. A sandbox names its own functions with local
// ids; the kernel turns each into a global id (`owner#local`) and records who holds it, so only an
// extension that was handed a callback can call it, and only through the kernel.
import type { KernelRequest, SandboxRequest, SerializedResponse } from '../sandbox/runtime.ts';
import { Access, type Guard } from './access.ts';
import { type AnyContract, type Contract, ContractRef } from './contract.ts';
import { Statics } from './extension.ts';
import type { Plan } from './loader.ts';
import { isPerCaller, perCallerDef } from './per-caller.ts';
import { Policy } from './policy.ts';
import type { Realm, RealmFactory } from './realm.ts';
import { type Refused, resolve } from './resolve.ts';
import { type KernelKeep, kernelFetch, type SecretStore } from './secrets.ts';
import type { KernelStorage } from './storage.ts';
import { CB, type CbRef, encode, mapRefs, Peer } from './wire.ts';

export class Refusal extends Error {
  override name = 'Refusal';
}

export interface KernelOptions {
  realms: RealmFactory;
  secrets: SecretStore;
  storage: KernelStorage;
  /** The kernel's own cache: conformance results. */
  keep?: KernelKeep;
  /** The person's access settings, by `extension/label`. */
  access?: () => Record<string, Access>;
  fetch?: typeof fetch;
  /** Whether a person acted just now, in `caller`'s own sandbox: the condition for a contract's
   * personal methods. In the browser, a fresh user activation with that sandbox's frame focused
   * (realm.ts, `userPresentIn`), so a tap in one extension can't be borrowed by another. */
  userPresent?: (caller: string) => boolean;
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
  /** Requires: contract key → provider id. */
  wiring: Record<string, string>;
  host?: { peer: Peer; realm: Realm; plan: Plan };
  /** The kernel's own providers (the kernel contract), by key. */
  local?: Map<string, object>;
}

type Fn = (...args: unknown[]) => unknown;

export const KERNEL = 'kernel';

export class Kernel {
  readonly policy: Policy;
  private readonly parties = new Map<string, Party>();
  private readonly refused = new Map<string, string[]>();
  /** The static fields of every extension that evaluated, running or not. */
  readonly seen = new Map<string, Statics>();
  private readonly cbs = new Map<
    string,
    { owner: string; local: string; guard?: Guard; holders: Set<string> }
  >();
  // The kernel's own callbacks (functions in what its providers return) and proxies for others'.
  private readonly kernelFns = new Map<string, Fn>();
  private readonly kernelProxies = new Map<string, Fn>();
  private nextFn = 0;

  private readonly opts: KernelOptions;

  constructor(opts: KernelOptions) {
    this.opts = opts;
    this.policy = new Policy(opts.storage, opts.access ?? (() => ({})));
  }

  private kernelParty(): Party {
    let me = this.parties.get(KERNEL);
    if (!me) {
      me = {
        id: KERNEL,
        statics: Statics.parse({ id: KERNEL, version: '1.0.0' }),
        wiring: {},
        local: new Map(),
      };
      this.parties.set(KERNEL, me);
    }
    return me;
  }

  /* ---------- Starting ---------- */

  /** Gives the kernel's own provider (the kernel contract) to extensions that require it. */
  provide(contract: AnyContract, impl: object) {
    const ref = ContractRef.parse(contract);
    const me = this.kernelParty();
    me.statics.provides[contract.name.replaceAll('.', '_')] = ref;
    me.local!.set(ref.key, impl);
  }

  /** Starts the extensions in `plans` beside those already running. Each is evaluated in a sandbox to
   * read its static fields; those the resolver accepts are set up in dependency order, and a provider
   * whose contract has a conformance suite must pass it before anything that requires it starts. */
  async start(plans: Map<string, Plan>, opts: StartOptions = {}) {
    const refused: Refused[] = [];
    const refuse = (id: string, problems: string[]) => {
      refused.push({ id, problems });
      this.refused.set(id, problems);
    };

    const inits = await Promise.all(
      [...plans].map(async ([id, plan]) => {
        try {
          const host = await this.spawn(id, plan);
          try {
            const statics = await host.peer.request({
              op: 'init',
              id,
              plan,
            } satisfies SandboxRequest);
            return { id, host, statics };
          } catch (e) {
            host.realm.dispose();
            throw e;
          }
        } catch (e) {
          refuse(id, [(e as Error).message]);
          return null;
        }
      }),
    );
    const hosts = new Map(inits.flatMap((x) => (x ? [[x.id, x.host] as const] : [])));
    for (const x of inits) {
      const parsed = x && Statics.safeParse(x.statics);
      if (parsed?.success) this.seen.set(x!.id, parsed.data);
    }
    const res = resolve(
      inits.flatMap((x) => (x ? [{ folder: x.id, statics: x.statics }] : [])),
      opts.choose,
      [...this.parties.values()].map((p) => ({ id: p.id, statics: p.statics })),
    );
    for (const r of res.refused) {
      refuse(r.id, r.problems);
      hosts.get(r.id)?.realm.dispose();
    }

    for (const a of res.accepted) {
      let host = hosts.get(a.id)!;
      // An optional provider that didn't start is left out; a required one stops this one.
      for (const [as, p] of Object.entries(a.wiring))
        if (as in a.statics.optional && !this.parties.has(p)) delete a.wiring[as];
      const down = Object.values(a.wiring).filter((p) => !this.parties.has(p));
      if (down.length) {
        refuse(a.id, [`${[...new Set(down)].join(', ')} could not start`]);
        host.realm.dispose();
        continue;
      }
      const refs = { ...a.statics.requires, ...a.statics.optional };
      const wiring = Object.fromEntries(
        Object.entries(a.wiring).map(([as, provider]) => [refs[as].key, provider]),
      );
      try {
        // A frame's device permissions are fixed when it is made: one that needs a device gets a
        // new sandbox, allowed exactly what its accepted static fields declare.
        if (a.statics.permissions.device.length) {
          host.realm.dispose();
          host = await this.spawn(a.id, host.plan, a.statics.permissions.device);
          await host.peer.request({
            op: 'init',
            id: a.id,
            plan: host.plan,
          } satisfies SandboxRequest);
        }
      } catch (e) {
        refuse(a.id, [(e as Error).message]);
        continue;
      }
      const party: Party = { id: a.id, statics: a.statics, wiring, host };
      this.parties.set(a.id, party);
      try {
        // biome-ignore lint/performance/noAwaitInLoops: setups run in dependency order
        await host.peer.request({
          op: 'setup',
          wired: Object.keys(wiring),
        } satisfies SandboxRequest);
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
        this.stop(a.id);
        refuse(a.id, [`setup failed: ${(e as Error).message}`]);
      }
    }
    return {
      started: res.accepted.map((a) => a.id).filter((id) => this.parties.has(id)),
      refused,
    };
  }

  /** An extension's static fields, read in a scratch sandbox that is closed straight after. */
  async inspect(id: string, plan: Plan): Promise<Statics> {
    const host = await this.spawn(`${id}~inspect`, plan);
    try {
      return Statics.parse(
        await host.peer.request({ op: 'init', id, plan } satisfies SandboxRequest),
      );
    } finally {
      host.realm.dispose();
    }
  }

  private async spawn(id: string, plan: Plan, device: readonly string[] = []) {
    const ui = plan.shared.some((m) => m.startsWith('react'));
    const realm = await this.opts.realms(id, { device, ui });
    const peer = new Peer(realm.port, (req) => this.route(id, req as KernelRequest));
    return { peer, realm, plan };
  }

  /** Runs a conformance suite against a scratch instance of `party`, wired as it is, with its own
   * namespace everywhere; what the scratch instance stored is dropped afterwards. Passing results are
   * cached by the shas of the provider and the suite. */
  private async conform(party: Party, key: string, suite: Plan) {
    const plan = party.host!.plan;
    const cacheKey = `conformance:${await digest({ key, p: plan.shas, s: suite.shas })}`;
    if (await this.opts.keep?.get(cacheKey)) return [];
    const id = `${party.id}~conformance`;
    const host = await this.spawn(id, plan, party.statics.permissions.device);
    this.parties.set(id, { ...party, id, host });
    try {
      await host.peer.request({ op: 'init', id, plan } satisfies SandboxRequest);
      await host.peer.request({
        op: 'setup',
        wired: Object.keys(party.wiring),
      } satisfies SandboxRequest);
      const results = (await host.peer.request({
        op: 'conformance',
        key,
        plan: suite,
      } satisfies SandboxRequest)) as { name: string; ok: boolean; error?: string }[];
      if (results.every((r) => r.ok)) await this.opts.keep?.set(cacheKey, true);
      return results;
    } finally {
      await this.forget(id);
      this.parties.delete(id);
      host.realm.dispose();
    }
  }

  /** Drops what `caller` left with the providers it required, and its own storage. */
  private async forget(caller: string) {
    const party = this.parties.get(caller);
    await Promise.all(
      Object.entries(party?.wiring ?? {}).map(async ([key, to]) => {
        const p = this.parties.get(to);
        if (p?.host)
          await p.host.peer
            .request({ op: 'forget', key, caller } satisfies SandboxRequest)
            .catch(() => undefined);
        const impl = p?.local?.get(key);
        if (isPerCaller(impl)) await perCallerDef(impl).forget?.(caller);
      }),
    );
    await this.opts.storage.drop(caller);
  }

  /** Stops an extension's sandbox. What requires it fails from then on, and is refused on the next
   * start. */
  stop(id: string) {
    this.parties.get(id)?.host?.realm.dispose();
    this.parties.delete(id);
  }

  /** Removes an extension's data: its storage, what providers keep for it, and its secrets. */
  async remove(id: string) {
    const statics = this.parties.get(id)?.statics;
    await this.forget(id);
    this.stop(id);
    for (const name of Object.keys(statics?.secrets ?? {}))
      await this.opts.secrets.forget(id, name);
  }

  dispose() {
    for (const id of [...this.parties.keys()]) this.stop(id);
  }

  running = () =>
    [...this.parties.values()]
      .filter((p) => p.id !== KERNEL)
      .map((p) => ({ id: p.id, statics: p.statics }));
  problems = () => new Map(this.refused);

  /** A handle on a running provider of `contract`, for the kernel's own use (as "kernel"). */
  use<T, W>(contract: Contract<T, W>, provider?: string): T {
    const to =
      provider ??
      [...this.parties.values()].find((p) =>
        Object.values(p.statics.provides).some((c) => c.key === contract.key),
      )?.id;
    if (!to) throw new Refusal(`nothing running provides ${contract.key}`);
    this.kernelParty().wiring[contract.key] = to;
    const remote = new Proxy(
      {},
      {
        get: (_, method) => {
          if (typeof method !== 'string' || method === 'then') return;
          return async (...args: unknown[]) =>
            this.fromKernelWire(
              await this.route(KERNEL, {
                op: 'call',
                key: contract.key,
                method,
                args: this.toKernelWire(args) as unknown[],
              }),
            );
        },
      },
    ) as W;
    return contract.client ? contract.client(remote, { caller: KERNEL }) : (remote as unknown as T);
  }

  /* ---------- Routing ---------- */

  private async route(from: string, req: KernelRequest): Promise<unknown> {
    switch (req.op) {
      case 'call': {
        const to = this.parties.get(from)?.wiring[req.key];
        if (!to) throw new Refusal(`${from} does not require ${req.key}`);
        const party = this.parties.get(to);
        if (!party) throw new Refusal(`${to}, which provides ${req.key}, is not running`);
        const contract = Object.values(party.statics.provides).find((c) => c.key === req.key);
        if (
          contract?.personal.includes(req.method) &&
          from !== KERNEL &&
          !this.opts.userPresent?.(from)
        )
          throw new Refusal(
            `${req.key}.${req.method} is for a person to do, right after a tap or key`,
          );
        const args = this.carry(from, to, req.args) as unknown[];
        const result = party.host
          ? await party.host.peer.request({
              op: 'call',
              from,
              key: req.key,
              method: req.method,
              args,
            } satisfies SandboxRequest)
          : await this.callLocal(party, from, req.key, req.method, args);
        return this.carry(to, from, result);
      }
      case 'invoke': {
        const cb = this.cbs.get(req.cb);
        if (!cb?.holders.has(from)) throw new Refusal(`${from} was not handed that callback`);
        const owner = this.parties.get(cb.owner);
        if (!owner) throw new Refusal(`${cb.owner} is not running`);
        const args = this.carry(from, cb.owner, req.args) as unknown[];
        if (cb.guard) await this.policy.admit({ from, to: cb.owner, guard: cb.guard, args });
        const result = owner.host
          ? await owner.host.peer.request({
              op: 'invoke',
              cb: cb.local,
              args,
            } satisfies SandboxRequest)
          : this.toKernelWire(
              await this.kernelFns.get(cb.local)!(...(this.fromKernelWire(args) as unknown[])),
            );
        return this.carry(cb.owner, from, result);
      }
      case 'kernel':
        return this.serve(from, req.method, req.args);
      default:
        throw new Refusal('unknown request');
    }
  }

  /** A value going from `sender` to `receiver`: the sender's own callback references become global
   * ones, which the receiver now holds. */
  private carry(sender: string, receiver: string, v: unknown): unknown {
    return mapRefs(v, (r) => {
      const gid = `${sender}#${r[CB]}`;
      let cb = this.cbs.get(gid);
      if (!cb) {
        const guard =
          typeof r.label === 'string' && Access.safeParse(r.access).success
            ? { label: r.label, access: r.access as Access }
            : undefined;
        if (guard) this.policy.see(sender, guard);
        cb = { owner: sender, local: r[CB], guard, holders: new Set() };
        this.cbs.set(gid, cb);
      }
      cb.holders.add(receiver);
      return { [CB]: gid, ...cb.guard } satisfies CbRef;
    });
  }

  private async callLocal(
    party: Party,
    from: string,
    key: string,
    method: string,
    args: unknown[],
  ) {
    let impl = party.local!.get(key) as Record<string, unknown>;
    if (isPerCaller(impl)) impl = perCallerDef(impl).make(from) as Record<string, unknown>;
    const fn = impl[method];
    if (typeof fn !== 'function' || !Object.hasOwn(impl, method))
      throw new Refusal(`${key} has no method "${method}"`);
    return this.toKernelWire(await (fn as Fn).apply(impl, this.fromKernelWire(args) as unknown[]));
  }

  // Values in the kernel's own calls: its functions get kernel-local ids; others' become proxies.
  private toKernelWire(v: unknown) {
    return encode(v, (fn) => {
      const lid = String(++this.nextFn);
      this.kernelFns.set(lid, fn);
      return { [CB]: lid };
    });
  }
  private fromKernelWire(v: unknown): unknown {
    return mapRefs(v, (r) => {
      const gid = r[CB];
      let fn = this.kernelProxies.get(gid);
      if (!fn) {
        fn = async (...args: unknown[]): Promise<unknown> =>
          this.fromKernelWire(
            await this.route(KERNEL, {
              op: 'invoke',
              cb: gid,
              args: this.toKernelWire(args) as unknown[],
            }),
          );
        this.kernelProxies.set(gid, fn);
      }
      return fn;
    });
  }

  /* ---------- What the kernel serves every extension (KernelApi) ---------- */

  private async serve(from: string, method: string, args: unknown[]): Promise<unknown> {
    const party = this.parties.get(from);
    if (!party?.host) throw new Refusal('not an extension');
    const s = this.opts.storage;
    const [a, b] = args;
    switch (method) {
      case 'fetch':
        return serialize(
          await kernelFetch(
            party.statics,
            this.opts.secrets,
            this.opts.fetch,
          )(String(a), (b ?? {}) as never),
        );
      case 'hasSecret':
        return String(a) in party.statics.secrets && this.opts.secrets.has(from, String(a));
      case 'storage.get':
        return s.get(from, String(a));
      case 'storage.set':
        return s.set(from, String(a), b);
      case 'storage.delete':
        return s.delete(from, String(a));
      case 'storage.list':
        return s.list(from, String(a ?? ''));
      default:
        throw new Refusal(`the kernel has no "${method}"`);
    }
  }
}

let streamsTransfer: boolean | undefined;
const canTransferStreams = () => {
  if (streamsTransfer === undefined)
    try {
      const rs = new ReadableStream();
      structuredClone(rs, { transfer: [rs] as unknown as Transferable[] });
      streamsTransfer = true;
    } catch {
      streamsTransfer = false;
    }
  return streamsTransfer;
};

/** A response as it crosses to a sandbox: the body as a stream where streams can be transferred (so
 * a streamed answer arrives as it comes), otherwise read whole. */
async function serialize(r: Response): Promise<SerializedResponse> {
  return {
    status: r.status,
    statusText: r.statusText,
    headers: [...r.headers],
    body: canTransferStreams() ? r.body : await r.arrayBuffer(),
  };
}

async function digest(v: unknown) {
  const bytes = new TextEncoder().encode(JSON.stringify(v));
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
    .map((x) => x.toString(16).padStart(2, '0'))
    .join('');
}
