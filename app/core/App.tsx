// The app: the session's files with the staged edits; the writer, held to the
// features' file rules; and the page the route points at, from whichever extension claims it, in the Shell.
// What the files mean is the features' own: the platform hands them the files.
import { useEffect, useMemo } from 'react';
import { searchIndex } from './search.ts';
import type { VaultFile } from './files.ts';
import type { OpenBackend } from './backend.ts';
import { useSession } from './session.ts';
import { useWriter, applyOverlay } from './writer.ts';
import { useRoute } from './route.ts';
import { HostContext, navOf, pageFor, type Host } from './host.tsx';
import { fileRules, type Extension } from './extension.ts';
import { Shell } from './Shell.tsx';
import { useUi } from './ui.ts';
import { Previews } from './Previews.tsx';
import { Unlock } from './Unlock.tsx';
import { ErrorState, Loading } from '@/components/layout.tsx';

const NONE: VaultFile[] = [];

/** What the app is made of, given where it is put together (main.tsx): the features and the backend. */
export interface Parts {
  extensions: Extension[];
  openBackend: OpenBackend;
}

export function App({ extensions: EXTENSIONS, openBackend }: Parts) {
  const RULES = useMemo(() => fileRules(EXTENSIONS), [EXTENSIONS]);
  const session = useSession(openBackend, RULES.keeps);
  const writer = useWriter(session.backend, RULES, session.head, session.setHead);
  const files = useMemo(
    () => (session.head ? applyOverlay(session.head.files, writer.overlay) : null),
    [session.head, writer.overlay],
  );

  const ui = useUi();
  const host: Host = {
    ui,
    files: files ?? NONE,
    writer,
    secrets: session.secrets,
    extensions: EXTENSIONS,
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
