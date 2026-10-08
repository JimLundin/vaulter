// The shell: the session's vault and its schema (meta/schema.yaml), derived; the worker's results; the
// writer; and the page the route points at, from whichever extension claims it, in the Shell.
import { useEffect, useMemo, useRef, useState } from 'react';
import { deriveVault } from '../../core/derive.ts';
import { schemaOf, NO_SCHEMA } from '../../core/schema.ts';
import { loadNotes } from '../../core/vault.ts';
import { searchIndex } from '../../core/search.ts';
import type { Heavy } from '../../core/heavy.ts';
import type { VaultFile } from '../../core/vault.ts';
import type { VaultBackend } from './backend.ts';
import { EXTENSIONS } from '../extensions/index.ts';
import { useSession } from './session.ts';
import { useWriter, applyOverlay } from './writer.ts';
import { useRoute } from './route.ts';
import { HostContext, navOf, pageFor, type Host } from './host.tsx';
import { Shell } from './Shell.tsx';
import { useUi } from './ui.ts';
import { Previews } from './Previews.tsx';
import { Unlock } from './Unlock.tsx';
import { OpenFolder } from './OpenFolder.tsx';
import { later } from './later.ts';
import { ErrorState, Loading } from '@/components/layout.tsx';

const MDX = Object.assign({}, ...EXTENSIONS.map((e) => e.mdx ?? {}));

export function App() {
  const session = useSession();
  const writer = useWriter(session.backend, session.head, session.setHead);
  const files = useMemo(
    () => (session.head ? applyOverlay(session.head.files, writer.overlay) : null),
    [session.head, writer.overlay],
  );
  const notes = useMemo(() => (files ? loadNotes(files) : []), [files]);
  const schema = useMemo(() => {
    try {
      return files ? schemaOf(files) : NO_SCHEMA;
    } catch (e) {
      return e as Error;
    }
  }, [files]);
  const vault = useMemo(
    () => deriveVault(notes, schema instanceof Error ? NO_SCHEMA : schema),
    [notes, schema],
  );
  const heavy = useHeavyResults(
    session.backend,
    files,
    notes,
    writer.overlay ? null : (session.head?.version ?? null),
  );

  const ui = useUi();
  const host: Host = {
    ui,
    vault,
    writer,
    secrets: session.secrets,
    extensions: EXTENSIONS,
    heavy: heavy.notes === notes ? heavy.value : {},
    mdx: MDX,
    index: new Map(),
    since: session.backend?.since,
    source: session.backend?.source,
  };
  // biome-ignore lint/correctness/useExhaustiveDependencies: host is new every render; the index needs only what navOf and the extensions read from it
  host.index = useMemo(
    () =>
      searchIndex([
        ...EXTENSIONS.flatMap((e) => e.search?.(vault) ?? []),
        ...navOf(host).map((n) => ({
          href: n.href,
          t: n.label,
          e: n.summary ?? '',
          a: [],
          k: 'page',
          g: [],
        })),
      ]),
    [vault, session.secrets, writer.history],
  );

  const route = useRoute();
  const page = files && !(schema instanceof Error) ? pageFor(route.path, host) : null;
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
  if (session.folder)
    return (
      <main className="px-4">
        <OpenFolder {...session.folder} />
      </main>
    );
  const { status } = session;
  return (
    <HostContext.Provider value={host}>
      <Shell page={page} status={status} signOut={session.signOut}>
        {page ? (
          page.body
        ) : schema instanceof Error ? (
          <ErrorState>{schema.message}</ErrorState>
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
  notes: unknown,
  version: string | null,
) {
  const [state, setState] = useState<{ notes: unknown; value: Partial<Heavy> }>({
    notes: null,
    value: {},
  });
  const worker = useRef<Worker | null>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: keyed on notes, the result's identity; files, version and backend change only along with it
  useEffect(() => {
    if (!files) return;
    let live = true;
    later(
      (async () => {
        // Saved results that can't be read are recomputed, like ones never saved.
        const kept = version
          ? await backend?.keep.get<{ version: string; heavy: Heavy }>('heavy').catch(() => null)
          : null;
        if (kept?.version === version) return live && setState({ notes, value: kept.heavy });
        worker.current ??= new Worker(new URL('./heavy.worker.ts', import.meta.url), {
          type: 'module',
        });
        const w = worker.current;
        const id = Math.random();
        w.onmessage = (e) => {
          if (e.data.id !== id || !live) return;
          setState({ notes, value: e.data.heavy });
          if (version && backend)
            later(backend.keep.set('heavy', { version, heavy: e.data.heavy }));
        };
        w.postMessage({ id, files });
      })(),
    );
    return () => {
      live = false;
    };
  }, [notes]);
  return state;
}
