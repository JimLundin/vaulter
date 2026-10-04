// Where an extension's code runs. In the browser, a sandboxed iframe with an opaque origin: no DOM of
// the app's, no cookies or storage of its origin, no network at all (its CSP); a MessagePort to the
// kernel is its only way out. In tests, the same runtime in this process (no isolation, the same
// protocol).
import { type RuntimeDeps, runtime } from '../sandbox/runtime.ts';
import type { Port } from './wire.ts';

export interface Realm {
  port: Port;
  dispose: () => void;
}

export interface RealmOptions {
  /** Device permissions from the extension's static fields: what its iframe is allowed. */
  device: readonly string[];
  /** Whether its plan imports React (views), so the sandbox needs that bundle too. */
  ui: boolean;
}

export type RealmFactory = (id: string, opts: RealmOptions) => Promise<Realm>;

export interface SandboxCode {
  /** The bootstrap: the frame's only inline script, allowed by its hash. */
  boot: string;
  /** The bundles it imports, as text: the kernel sends them, so a sandbox loads nothing itself and
   * starts offline (a service worker can't serve a frame with an opaque origin). */
  bundles: () => Promise<{ core: string; ui: string }>;
}

const base64 = (bytes: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(bytes)));

/** One sandboxed srcdoc iframe per extension: its own policy forbids any network. */
export function iframeRealms(code: SandboxCode, timeoutMs = 20_000): RealmFactory {
  let hash: Promise<string> | undefined;
  return async (id, opts) => {
    hash ??= crypto.subtle
      .digest('SHA-256', new TextEncoder().encode(code.boot))
      .then((h) => `'sha256-${base64(h)}'`);
    const [h, bundles] = await Promise.all([hash, code.bundles()]);
    const policy = [
      "default-src 'none'",
      `script-src ${h} blob:`,
      "style-src 'unsafe-inline'",
      'img-src data: blob:',
      "connect-src 'none'",
      "base-uri 'none'",
      "form-action 'none'",
    ].join('; ');
    return new Promise((ok, fail) => {
      const frame = document.createElement('iframe');
      frame.setAttribute('sandbox', 'allow-scripts');
      frame.allow = opts.device.map((d) => `${d} *`).join('; ');
      frame.dataset.extension = id;
      frame.style.display = 'none';
      frame.srcdoc = `<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${policy}"><script>${code.boot}</script>`;
      const channel = new MessageChannel();
      const timer = setTimeout(() => {
        removeEventListener('message', onReady);
        frame.remove();
        fail(new Error(`the sandbox for ${id} did not start`));
      }, timeoutMs);
      function onReady(e: MessageEvent) {
        if (e.source !== frame.contentWindow || e.data !== 'pip:ready') return;
        clearTimeout(timer);
        removeEventListener('message', onReady);
        const modules = opts.ui ? bundles : { core: bundles.core };
        // An opaque origin can only be addressed as "*"; the port is the channel from here on.
        frame.contentWindow!.postMessage({ t: 'pip:boot', modules }, '*', [channel.port2]);
        ok({ port: channel.port1 as unknown as Port, dispose: () => frame.remove() });
      }
      addEventListener('message', onReady);
      (document.getElementById('pip-sandboxes') ?? document.body).append(frame);
    });
  };
}

/** Whether the person just acted in `caller`'s sandbox: a user activation that is still fresh, with
 * that sandbox's frame focused. Activation in a frame propagates up to this page; focus says which
 * frame it was. */
export function userPresentIn(caller: string): boolean {
  const active = document.activeElement;
  return (
    navigator.userActivation?.isActive === true &&
    active instanceof HTMLIFrameElement &&
    active.dataset.extension === caller
  );
}

/** The runtime in this process, over a MessageChannel: for tests. */
export function inProcessRealms(deps: RuntimeDeps): RealmFactory {
  let n = 0;
  return () => {
    const channel = new MessageChannel();
    // A comment per realm, so two "sandboxes" never share a module instance in this one process.
    const realm = ++n;
    runtime(channel.port2 as unknown as Port, {
      ...deps,
      url: (code) => deps.url(`${code}\n//realm ${realm}`),
    });
    return Promise.resolve({
      port: channel.port1 as unknown as Port,
      dispose: () => {
        channel.port1.close();
        channel.port2.close();
      },
    });
  };
}
