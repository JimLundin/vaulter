// What crosses between the kernel and a sandbox. Values are copied (structured clone); a function
// anywhere in a value becomes a callback reference, and calling it on the far side is a message
// routed back by the kernel. A Zod schema can't cross: a contract's client converts it first.
import type { Guard } from './access.ts';

export const CB = '__pip_cb';
export interface CbRef extends Partial<Guard> {
  [CB]: string;
}
export const isRef = (v: unknown): v is CbRef =>
  typeof v === 'object' && v !== null && typeof (v as CbRef)[CB] === 'string';

type Fn = (...args: unknown[]) => unknown;

const plain = (v: object) => {
  const p = Object.getPrototypeOf(v);
  return p === Object.prototype || p === null;
};

/** Copies `v`, turning each function into a reference made by `ref`. */
export function encode(v: unknown, ref: (fn: Fn) => CbRef): unknown {
  if (typeof v === 'function') return ref(v as Fn);
  if (typeof v !== 'object' || v === null) return v;
  if (Array.isArray(v)) return v.map((x) => encode(x, ref));
  if ('_zod' in v)
    throw new TypeError('a Zod schema cannot cross a sandbox; convert it with z.toJSONSchema');
  if (v instanceof Map) return new Map([...v].map(([k, x]) => [k, encode(x, ref)]));
  if (plain(v)) {
    if (CB in v) throw new TypeError(`"${CB}" is reserved`);
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v)) out[k] = encode(x, ref);
    return out;
  }
  // Dates, binary data, errors, streams: structured clone copies (or transfers) them.
  return v;
}

/** Maps every callback reference in `v`: to a function in a sandbox, or to a new id in the kernel. */
export function mapRefs(v: unknown, f: (r: CbRef) => unknown): unknown {
  if (typeof v !== 'object' || v === null) return v;
  if (isRef(v)) return f(v);
  if (Array.isArray(v)) return v.map((x) => mapRefs(x, f));
  if (v instanceof Map) return new Map([...v].map(([k, x]) => [k, mapRefs(x, f)]));
  if (!plain(v)) return v;
  const out: Record<string, unknown> = {};
  for (const [k, x] of Object.entries(v)) out[k] = mapRefs(x, f);
  return out;
}

/** Streams in `v`, to transfer rather than copy. */
export function transferables(v: unknown, out: Transferable[] = []): Transferable[] {
  if (typeof ReadableStream !== 'undefined' && v instanceof ReadableStream) out.push(v);
  else if (Array.isArray(v)) for (const x of v) transferables(x, out);
  else if (typeof v === 'object' && v !== null && plain(v))
    for (const x of Object.values(v)) transferables(x, out);
  return out;
}

/* ---------- Requests and their results over one port ---------- */

export interface Port {
  postMessage: (message: unknown, transfer?: Transferable[]) => void;
  onmessage: ((e: MessageEvent) => void) | null;
}

type Envelope =
  | { n: number; req: unknown }
  | { n: number; ok: true; value: unknown }
  | { n: number; ok: false; error: { name: string; message: string } };

/** Both ends of a port send requests and answer the other's; `serve` answers incoming ones. */
export class Peer {
  private n = 0;
  private readonly waiting = new Map<
    number,
    { ok: (v: unknown) => void; fail: (e: Error) => void }
  >();

  private readonly port: Port;

  constructor(port: Port, serve: (req: unknown) => Promise<unknown>) {
    this.port = port;
    port.onmessage = (e: MessageEvent) => {
      const m = e.data as Envelope;
      if ('req' in m) {
        serve(m.req).then(
          (value) => this.answer({ n: m.n, ok: true, value }),
          (err: unknown) =>
            this.answer({
              n: m.n,
              ok: false,
              error: {
                name: (err as Error)?.name ?? 'Error',
                message: (err as Error)?.message ?? String(err),
              },
            }),
        );
        return;
      }
      const w = this.waiting.get(m.n);
      if (!w) return;
      this.waiting.delete(m.n);
      if (m.ok) w.ok(m.value);
      else w.fail(Object.assign(new Error(m.error.message), { name: m.error.name }));
    };
  }

  request(req: unknown): Promise<unknown> {
    const n = ++this.n;
    return new Promise((ok, fail) => {
      this.waiting.set(n, { ok, fail });
      try {
        this.port.postMessage({ n, req }, transferables(req));
      } catch (e) {
        this.waiting.delete(n);
        fail(e as Error);
      }
    });
  }

  private answer(m: Envelope) {
    try {
      this.port.postMessage(m, 'ok' in m && m.ok ? transferables(m.value) : []);
    } catch (e) {
      // A value that can't be copied: the asker gets the error rather than waiting forever.
      this.port.postMessage({
        n: m.n,
        ok: false,
        error: { name: 'DataCloneError', message: (e as Error).message },
      });
    }
  }
}
