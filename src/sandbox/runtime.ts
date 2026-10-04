// The kernel's half inside a sandbox: links and evaluates the extension's plan, reports its static
// fields, runs `setup` when the kernel says so, and serves calls to what it provides. Every call out,
// to a contract, a callback or the kernel itself, is a message to the kernel; nothing here can reach
// another sandbox directly.
import { guardOf } from '../kernel/access.ts';
import { type CheckResult, runSuite, type Suite } from '../kernel/conformance.ts';
import type { AnyContract } from '../kernel/contract.ts';
import type { Extension, ExtStorage, FetchInit, KernelApi } from '../kernel/extension.ts';
import type { Plan } from '../kernel/loader.ts';
import { isPerCaller, perCallerDef } from '../kernel/per-caller.ts';
import { CB, type CbRef, encode, mapRefs, Peer, type Port } from '../kernel/wire.ts';
import { linker } from './link.ts';

export interface RuntimeDeps {
  /** A module URL for code: a blob: URL in a browser sandbox. */
  url: (code: string) => string;
  load: (url: string) => Promise<Record<string, unknown>>;
  /** The shared modules, loaded on first use. */
  shared: Record<string, () => Promise<object>>;
}

/** What the kernel asks of a sandbox. */
export type SandboxRequest =
  | { op: 'init'; id: string; plan: Plan }
  | { op: 'setup' }
  | { op: 'call'; from: string; key: string; method: string; args: unknown[] }
  | { op: 'invoke'; cb: string; args: unknown[] }
  | { op: 'conformance'; key: string; plan: Plan }
  | { op: 'forget'; key: string; caller: string };

/** What a sandbox asks of the kernel. */
export type KernelRequest =
  | { op: 'call'; key: string; method: string; args: unknown[] }
  | { op: 'invoke'; cb: string; args: unknown[] }
  | { op: 'kernel'; method: string; args: unknown[] };

export interface SerializedResponse {
  status: number;
  statusText: string;
  headers: [string, string][];
  body: ReadableStream<Uint8Array> | ArrayBuffer | null;
}

type Fn = (...args: unknown[]) => unknown;
const NOT_METHODS = new Set(Object.getOwnPropertyNames(Object.prototype));

export function runtime(port: Port, deps: RuntimeDeps) {
  let id = '';
  let def: Extension['def'] | undefined;
  const loaded: Record<string, object> = {};
  let link: ((plan: Plan) => string) | undefined;

  // Functions handed out, by local id; and proxies for the far side's, by kernel id.
  const local = new Map<string, Fn>();
  const proxies = new Map<string, Fn>();
  let nextCb = 0;
  const toWire = (v: unknown) =>
    encode(v, (fn) => {
      const lid = String(++nextCb);
      local.set(lid, fn);
      const guard = guardOf(fn);
      return { [CB]: lid, ...guard } as CbRef;
    });
  const fromWire = (v: unknown): unknown =>
    mapRefs(v, (r) => {
      const gid = r[CB];
      let fn = proxies.get(gid);
      if (!fn) {
        fn = async (...args: unknown[]): Promise<unknown> =>
          fromWire(await peer.request({ op: 'invoke', cb: gid, args: toWire(args) as unknown[] }));
        proxies.set(gid, fn);
      }
      return fn;
    });

  const kernelCall = async (method: string, ...args: unknown[]) =>
    fromWire(
      await peer.request({
        op: 'kernel',
        method,
        args: toWire(args) as unknown[],
      } satisfies KernelRequest),
    );

  const remote = (key: string): object =>
    new Proxy(
      {},
      {
        get(_, method) {
          // Not a thenable, and no symbols: only named methods cross.
          if (typeof method !== 'string' || method === 'then') return;
          return async (...args: unknown[]) =>
            fromWire(
              await peer.request({ op: 'call', key, method, args: toWire(args) as unknown[] }),
            );
        },
      },
    );

  const storage: ExtStorage = {
    get: (key) => kernelCall('storage.get', key) as never,
    set: (key, value) => kernelCall('storage.set', key, value) as Promise<void>,
    delete: (key) => kernelCall('storage.delete', key) as Promise<void>,
    list: (prefix) => kernelCall('storage.list', prefix ?? '') as never,
  };
  const kernelApi = (): KernelApi => ({
    id,
    async fetch(url: string, init?: FetchInit) {
      const r = (await kernelCall('fetch', url, init ?? {})) as SerializedResponse;
      return new Response(r.body, {
        status: r.status,
        statusText: r.statusText,
        headers: r.headers,
      });
    },
    hasSecret: (name) => kernelCall('hasSecret', name) as Promise<boolean>,
    storage,
  });

  // What this extension provides: by contract key, its handle and implementation (or per caller).
  const provided = new Map<string, { contract: AnyContract; impl: object }>();
  const perCallerImpls = new Map<string, object>();
  const implFor = (key: string, caller: string) => {
    const p = provided.get(key);
    if (!p) throw new Error(`${id} does not provide ${key}`);
    if (!isPerCaller(p.impl)) return p.impl;
    const k = `${key}\n${caller}`;
    if (!perCallerImpls.has(k)) perCallerImpls.set(k, perCallerDef(p.impl).make(caller));
    return perCallerImpls.get(k)!;
  };

  const linkPlan = async (plan: Plan) => {
    await Promise.all(
      plan.shared.map(async (s) => {
        if (!deps.shared[s]) throw new Error(`the sandbox has no shared module "${s}"`);
        loaded[s] ??= await deps.shared[s]();
      }),
    );
    link ??= linker(deps.url, loaded);
    return deps.load(link(plan));
  };

  const serve = async (raw: unknown): Promise<unknown> => {
    const req = raw as SandboxRequest;
    switch (req.op) {
      case 'init': {
        id = req.id;
        const ext = (await linkPlan(req.plan)).default as Extension | undefined;
        if (ext?.kind !== 'extension' || typeof ext.def?.setup !== 'function')
          throw new Error('the default export is not defineExtension({...})');
        def = ext.def;
        return staticsOf(def);
      }
      case 'setup': {
        if (!def) throw new Error('setup before init');
        const ctx: Record<string, unknown> = {};
        for (const [as, c] of Object.entries(def.requires ?? {}) as [string, AnyContract][]) {
          const r = remote(c.key);
          ctx[as] = c.client ? c.client(r, { caller: id }) : r;
        }
        const out = (await def.setup(ctx as never, kernelApi())) as
          | Record<string, unknown>
          | undefined;
        for (const [as, c] of Object.entries(def.provides ?? {}) as [string, AnyContract][]) {
          const impl = out?.[as];
          if (typeof impl !== 'object' || impl === null)
            throw new Error(`provides ${c.key} as "${as}" but setup returned nothing for it`);
          if (!isPerCaller(impl)) missing(c, impl);
          provided.set(c.key, { contract: c, impl });
        }
        return [...provided.keys()];
      }
      case 'call': {
        const impl = implFor(req.key, req.from) as Record<string, unknown>;
        missing(provided.get(req.key)!.contract, impl);
        const fn = impl[req.method];
        if (typeof fn !== 'function' || NOT_METHODS.has(req.method))
          throw new Error(`${req.key} has no method "${req.method}"`);
        let args = fromWire(req.args) as unknown[];
        const schema = provided.get(req.key)!.contract.inputs[req.method] as
          | {
              safeParse: (v: unknown) => {
                success: boolean;
                data?: unknown;
                error?: { issues: { path: PropertyKey[]; message: string }[] };
              };
            }
          | undefined;
        if (schema) {
          const parsed = schema.safeParse(args);
          if (!parsed.success)
            throw Object.assign(
              new Error(
                `${req.from} → ${req.key}.${req.method}: ${parsed.error!.issues.map((i) => `${i.path.join('.') || 'arguments'}: ${i.message}`).join('; ')}`,
              ),
              { name: 'Refusal' },
            );
          args = parsed.data as unknown[];
        }
        return toWire(await (fn as Fn).apply(impl, args));
      }
      case 'invoke': {
        const fn = local.get(req.cb);
        if (!fn) throw new Error('that callback is gone');
        return toWire(await fn(...(fromWire(req.args) as unknown[])));
      }
      case 'conformance': {
        const p = provided.get(req.key);
        if (!p) throw new Error(`${id} does not provide ${req.key}`);
        const suite = (await linkPlan(req.plan)).default as Suite<unknown> | undefined;
        if (suite?.kind !== 'conformance') throw new Error(`${req.plan.entry} exports no suite`);
        const { contract } = p;
        // Each check gets a fresh caller, so per-caller providers start it empty.
        const results: CheckResult[] = await runSuite(suite, (n) => {
          const caller = `check-${n}`;
          const impl = implFor(req.key, caller);
          return contract.client ? contract.client(impl as never, { caller }) : impl;
        });
        return results;
      }
      case 'forget': {
        const p = provided.get(req.key);
        if (p && isPerCaller(p.impl)) await perCallerDef(p.impl).forget?.(req.caller);
        perCallerImpls.delete(`${req.key}\n${req.caller}`);
        return null;
      }
      default:
        throw new Error('unknown request');
    }
  };

  const peer = new Peer(port, serve);
  return peer;
}

/** The static fields as plain values: contracts by name and version only. */
function staticsOf(def: Extension['def']) {
  const refs = (m: Record<string, AnyContract> | undefined) =>
    Object.fromEntries(
      Object.entries(m ?? {}).map(([as, c]) => [
        as,
        { kind: c?.kind, name: c?.name, version: c?.version, personal: c?.personal },
      ]),
    );
  const { id, version, permissions, secrets, agentGuide, author } = def;
  return structuredClone({
    id,
    version,
    requires: refs(def.requires),
    provides: refs(def.provides),
    permissions,
    secrets,
    agentGuide,
    author,
  });
}

/** Every method the contract has inputs for is a function on the implementation. */
function missing(c: AnyContract, impl: unknown) {
  const absent = Object.keys(c.inputs).filter(
    (m) => typeof (impl as Record<string, unknown> | null)?.[m] !== 'function',
  );
  if (absent.length) throw new Error(`${c.key} is missing ${absent.join(', ')}`);
}
