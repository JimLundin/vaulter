// What every view can reach: the vault (and its schema), the writer, the secrets and the extensions, plus
// the slots where extensions render (note sections, note actions, home sections). The shell (App.tsx) provides it.
// biome-ignore lint/correctness/noUnresolvedImports: Fragment is in @types/react's namespace, which Biome doesn't follow
import { createContext, Fragment } from 'react';
import { useContext } from 'react';
import type { ComponentType } from 'react';
import type { Vault } from '../../core/derive.ts';
import type { Note } from '../../core/note-fields.ts';
import type { Secrets } from '../../core/sealed.ts';
import type { Heavy, HeavyKey } from '../../core/heavy.ts';
import type { Extension, Page } from './extension.ts';
import type { Entry } from '../../core/search.ts';
import type { Writer } from './writer.ts';
import type { VaultBackend } from './backend.ts';
import { link } from './route.ts';
import { PageHeader } from '@/components/layout.tsx';

export interface Host {
  vault: Vault;
  writer: Writer;
  secrets: Secrets | null;
  extensions: Extension[];
  /** The worker's results for this vault, as they arrive. */
  heavy: Partial<Heavy>;
  /** Every MDX component the extensions provide. */
  mdx: Record<string, ComponentType<any>>;
  /** Search and previews: every extension's entries, and the nav's pages. */
  index: Map<string, Entry>;
  /** The backend's history since a day, where it keeps one (the audit). */
  since?: VaultBackend['since'];
  /** Where a file can be seen at its source, if the backend has one. */
  source?: VaultBackend['source'];
}

export const HostContext = createContext<Host>(null!);
export const useHost = () => useContext(HostContext);
export const useVault = () => useHost().vault;
/** The vault's vocabulary (meta/schema.yaml): types, areas, statuses, circles, predicates. */
export const useSchema = () => useHost().vault.schema;
export const useWriter = () => useHost().writer;
/** A slow derivation (core/heavy.ts), or null until the worker has it. */
export const useHeavy = <K extends HeavyKey>(k: K): Heavy[K] | null => useHost().heavy[k] ?? null;

const sorted = <T extends { order: number }>(xs: T[]) => [...xs].sort((a, b) => a.order - b.order);
/** The extensions' entries in one slot, by order, each keyed by its extension and its place there. */
const slot = <T extends { order: number }>(
  extensions: Extension[],
  of: (e: Extension) => T[] | undefined,
) =>
  sorted(extensions.flatMap((e) => (of(e) ?? []).map((s, i) => ({ ...s, key: `${e.id}.${i}` }))));

export function NoteSections({ note }: { note: Note }) {
  const { extensions } = useHost();
  return (
    <>
      {slot(extensions, (e) => e.noteSections).map(({ view: V, key }) => (
        <V key={key} note={note} />
      ))}
    </>
  );
}

export function NoteActions({ note }: { note: Note }) {
  const host = useHost();
  return (
    <>
      {host.extensions
        .flatMap((e) => e.noteActions ?? [])
        .filter((a) => !a.when || a.when(host))
        .map((a) => (
          <Fragment key={a.label}>
            {' '}
            · <a href={link(a.href(note))}>{a.label}</a>
          </Fragment>
        ))}
    </>
  );
}

export function HomeSections() {
  const { extensions } = useHost();
  return (
    <>
      {slot(extensions, (e) => e.homeSections).map(({ view: V, key }) => (
        <V key={key} />
      ))}
    </>
  );
}

export const navOf = (host: Host) =>
  sorted(host.extensions.flatMap((e) => e.nav ?? []).filter((n) => !n.when || n.when(host)));

export function pageFor(path: string, host: Host): Page {
  for (const e of host.extensions) {
    const p = e.page?.(path, host);
    if (p) return p;
  }
  return {
    title: 'Not found',
    body: (
      <PageHeader
        title="Not found"
        lede={
          <>
            Nothing at <code>{path}</code>. <a href={link('/')}>Home</a>
          </>
        }
      />
    ),
  };
}
