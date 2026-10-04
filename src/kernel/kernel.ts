// Starting the extensions: resolve them, then run each `setup` in dependency order with brokered handles
// for what it requires. A setup that throws, or provides less than it declared, leaves that extension out
// and everything that needed it; the rest start (ARCHITECTURE.md, "The kernel").
import { type Gate, handle } from './broker.ts';
import type { AnyContract, Contract } from './contract.ts';
import { type Candidate, type Refused, resolve } from './resolve.ts';
import { kernelApi, type SecretStore } from './secrets.ts';
import type { Statics } from './extension.ts';
import { forCaller, isPerCaller } from './per-caller.ts';

export interface Running {
  id: string;
  statics: Statics;
  /** What it provides, by contract key: the provider's own objects, never handed out unbrokered. */
  provided: Map<string, object>;
}

export interface Booted {
  running: Running[];
  refused: Refused[];
}

export interface BootOptions {
  secrets: SecretStore;
  /** Contract key → extension id, where two installed extensions provide the same contract. */
  choose?: Record<string, string>;
  gate?: Gate;
  fetch?: typeof fetch;
  /** Extensions already running (the bootstrap set): their contracts can be required. */
  started?: Running[];
}

const allow: Gate = () => undefined;

export async function boot(candidates: Candidate[], opts: BootOptions): Promise<Booted> {
  const started = opts.started ?? [];
  const { accepted, refused } = resolve(candidates, opts.choose, started);
  const gate = opts.gate ?? allow;
  const running = new Map<string, Running>(started.map((r) => [r.id, r]));

  for (const ext of accepted) {
    const missing = Object.values(ext.wiring).filter((id) => !running.has(id));
    if (missing.length) {
      refused.push({ id: ext.id, problems: [`${missing.join(', ')} could not start`] });
      continue;
    }
    try {
      const ctx: Record<string, object> = {};
      for (const [as, c] of Object.entries(ext.statics.requires))
        ctx[as] = connect(running.get(ext.wiring[as])!, c, ext.id, gate);
      // One at a time, in order: a setup may use what the ones before it provide.
      // biome-ignore lint/performance/noAwaitInLoops: setups run in dependency order
      const out = (await ext.def.setup(
        ctx as never,
        kernelApi(ext.statics, opts.secrets, opts.fetch),
      )) as Record<string, unknown> | undefined;
      running.set(ext.id, {
        id: ext.id,
        statics: ext.statics,
        provided: provided(ext.statics, out),
      });
    } catch (e) {
      refused.push({ id: ext.id, problems: [`setup failed: ${(e as Error).message}`] });
    }
  }
  return {
    running: [...running.values()].filter((r) => !started.includes(r)),
    refused,
  };
}

/** A brokered handle on what `provider` provides for `contract`, as `from` sees it. The kernel uses
 * this itself (as "kernel") for the bootstrap source provider. */
export function connect<T>(
  provider: Running,
  contract: Contract<T>,
  from: string,
  gate: Gate = allow,
): T {
  const p = provider.provided.get(contract.key);
  if (!p) throw new Error(`${provider.id} does not provide ${contract.key}`);
  const impl = isPerCaller(p) ? forCaller(p, from) : p;
  check(contract, impl);
  return handle(impl as T & object, contract, from, provider.id, gate);
}

/** Checks that setup returned an object for each contract in `provides`. */
function provided(statics: Statics, out: Record<string, unknown> | undefined): Map<string, object> {
  const map = new Map<string, object>();
  for (const [as, c] of Object.entries(statics.provides)) {
    const impl = out?.[as];
    if (typeof impl !== 'object' || impl === null)
      throw new Error(`provides ${c.key} as "${as}" but setup returned nothing for it`);
    if (!isPerCaller(impl)) check(c, impl);
    map.set(c.key, impl);
  }
  return map;
}

/** Every method the contract has inputs for is a function on the implementation. */
function check(c: AnyContract, impl: unknown) {
  const absent = Object.keys(c.inputs).filter(
    (m) => typeof (impl as Record<string, unknown> | null)?.[m] !== 'function',
  );
  if (absent.length) throw new Error(`${c.key} is missing ${absent.join(', ')}`);
}
