// The app: the session's files with the staged edits; the worker's results; the writer, held to the
// features' file rules; and the page the route points at, from whichever extension claims it, in the Shell.
// What the files mean is the features' own: the platform hands them the files.
import { useEffect, useMemo, useRef, useState } from 'react';
import { searchIndex } from './search.ts';
import type { VaultFile } from './files.ts';
import type { VaultBackend } from './backend.ts';
import { EXTENSIONS } from '../extensions/index.ts';
import { useSession } from './session.ts';
import { useWriter, applyOverlay } from './writer.ts';
import { useRoute } from './route.ts';
import { HostContext, navOf, pageFor, type Host } from './host.tsx';
import { fileRules } from './extension.ts';
import { Shell } from './Shell.tsx';
import { useUi } from './ui.ts';
import { Previews } from './Previews.tsx';
import { Unlock } from './Unlock.tsx';
import { later } from './later.ts';
import { ErrorState, Loading } from '@/components/layout.tsx';

const MDX = Object.assign({}, ...EXTENSIONS.map((e) => e.mdx ?? {}));
const RULES = fileRules(EXTENSIONS);
const NONE: VaultFile[] = [];

export function App() {
  const session = useSession(RULES.keeps);
  const writer = useWriter(session.backend, RULES, session.head, session.setHead);
  const files = useMemo(
    () => (session.head ? applyOverlay(session.head.files, writer.overlay) : null),
    [session.head, writer.overlay],
  );
  const heavy = useHeavyResults(
    session.backend,
    files,
    writer.overlay ? null : (session.head?.version ?? null),
  );

  const ui = useUi();
  const host: Host = {
    ui,
    files: files ?? NONE,
    writer,
    secrets: session.secrets,
    extensions: EXTENSIONS,
    heavy: heavy.files === files ? heavy.value : {},
    mdx: MDX,
    index: new Map(),
    since: session.backend?.since,
    source: session.backend?.source,
  };
  // biome-ignore lint/correctness/useExhaustiveDependencies: host is new every render; the index needs only what navOf and the extensions read from it
  host.index = useMemo(
    () =>
      searchIndex([
        ...EXTENSIONS.flatMap((e) => e.search?.(host) ?? []),
        ...navOf(host).map((n) => ({
          href: n.href,
          t: n.label,
          e: n.summary ?? '',
          a: [],
          k: 'page',
          g: [],
        })),
      ]),
    [files, session.secrets, writer.history],
  );

  const route = useRoute();
  const blocked = files
    ? (EXTENSIONS.map((e) => e.blocked?.(host)).find((b) => b != null) ?? null)
    : null;
  const page = files && !blocked ? pageFor(route.path, host) : null;
  const title = page?.title;
  useEffect(() => {
    document.title = !title || title === 'Home' ? 'Vault' : `${title} · Vault`;
  }, [title]);
  // A new page starts at the top, or at the heading the route names.
  const ready = !!files;
  // biome-ignore lint/correctness/useExhaustiveDependencies: route.path is the trigger (a new page), not something the effect reads
  useEffect(() => {
    if (!ready) return;
    const el = route.anchor && document.getElementById(route.anchor);
    if (el) el.scrollIntoView();
    else scrollTo(0, 0);
  }, [route.path, route.anchor, ready]);

  if (session.locked)
    return (
      <main className="px-4">
        <Unlock unlock={session.locked.unlock} />
      </main>
    );
  const { status } = session;
  return (
    <HostContext.Provider value={host}>
      <Shell page={page} status={status} signOut={session.signOut}>
        {page ? (
          page.body
        ) : blocked ? (
          <ErrorState>{blocked}</ErrorState>
        ) : status.kind === 'error' ? (
          <ErrorState>{status.message}</ErrorState>
        ) : (
          <Loading>
            {status.kind === 'syncing' ? 'Fetching the vault…' : 'Opening the vault…'}
          </Loading>
        )}
      </Shell>
      {ready && <Previews index={host.index} />}
    </HostContext.Provider>
  );
}

/** The slow derivations: kept for a version when one was saved for it, otherwise from the worker. */
function useHeavyResults(
  backend: VaultBackend | null,
  files: VaultFile[] | null,
  version: string | null,
) {
  type Heavy = Record<string, unknown>;
  const [state, setState] = useState<{ files: VaultFile[] | null; value: Heavy }>({
    files: null,
    value: {},
  });
  const worker = useRef<Worker | null>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: keyed on files, the result's identity; version and backend change only along with it
  useEffect(() => {
    if (!files) return;
    let live = true;
    later(
      (async () => {
        // Saved results that can't be read are recomputed, like ones never saved.
        const kept = version
          ? await backend?.keep.get<{ version: string; heavy: Heavy }>('heavy').catch(() => null)
          : null;
        if (kept?.version === version) return live && setState({ files, value: kept.heavy });
        worker.current ??= new Worker(new URL('./heavy.worker.ts', import.meta.url), {
          type: 'module',
        });
        const w = worker.current;
        const id = Math.random();
        w.onmessage = (e) => {
          if (e.data.id !== id || !live) return;
          setState({ files, value: e.data.heavy });
          if (version && backend)
            later(backend.keep.set('heavy', { version, heavy: e.data.heavy }));
        };
        w.postMessage({ id, files });
      })(),
    );
    return () => {
      live = false;
    };
  }, [files]);
  return state;
}
