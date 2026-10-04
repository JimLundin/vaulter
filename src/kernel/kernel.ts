// Starting the extensions: resolve them, then run each `setup` in dependency order with brokered handles
// for what it requires. A setup that throws, or provides less than it declared, leaves that extension out
// and everything that needed it; the rest start (ARCHITECTURE-pip.md, "The kernel").
// Still to come here: fetching and compiling source per commit, the sandbox, and safe mode.
import { type Gate, handle } from './broker.ts';
import type { AnyContract } from './contract.ts';
import { type Candidate, type Refused, resolve } from './resolve.ts';
import { kernelApi, type SecretStore } from './secrets.ts';
import type { Statics } from './extension.ts';

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
}

const allow: Gate = () => undefined;

export async function boot(candidates: Candidate[], opts: BootOptions): Promise<Booted> {
  const { accepted, refused } = resolve(candidates, opts.choose);
  const gate = opts.gate ?? allow;
  const running = new Map<string, Running>();

  for (const ext of accepted) {
    const missing = Object.values(ext.wiring).filter((id) => !running.has(id));
    if (missing.length) {
      refused.push({ id: ext.id, problems: [`${missing.join(', ')} could not start`] });
      continue;
    }
    const ctx: Record<string, object> = {};
    for (const [as, c] of Object.entries(ext.statics.requires) as [string, AnyContract][]) {
      const to = ext.wiring[as];
      ctx[as] = handle(running.get(to)!.provided.get(c.key)!, c, ext.id, to, gate);
    }
    try {
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
  return { running: [...running.values()], refused };
}

/** Checks that setup returned an object for each contract in `provides`, with every method the
 * contract has inputs for. */
function provided(statics: Statics, out: Record<string, unknown> | undefined): Map<string, object> {
  const map = new Map<string, object>();
  for (const [as, c] of Object.entries(statics.provides)) {
    const impl = out?.[as];
    if (typeof impl !== 'object' || impl === null)
      throw new Error(`provides ${c.key} as "${as}" but setup returned nothing for it`);
    const absent = Object.keys(c.inputs).filter(
      (m) => typeof (impl as Record<string, unknown>)[m] !== 'function',
    );
    if (absent.length) throw new Error(`${c.key} is missing ${absent.join(', ')}`);
    map.set(c.key, impl);
  }
  return map;
}
