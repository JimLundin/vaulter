// What every view can reach: the files (with staged edits), the writer, the secrets and the extensions.
// App.tsx provides it; what the files mean is the features' (notes, the graph). A feature's own places are its slots (slot.ts).
import { createContext } from 'react';
import { useContext } from 'react';
import type { ComponentType } from 'react';
import type { Secrets } from './sealed.ts';
import type { Extension, Page } from './extension.ts';
import type { Entry } from './search.ts';
import type { Writer } from './writer.ts';
import type { VaultFile } from './files.ts';
import type { VaultBackend } from './backend.ts';
import { link } from './route.ts';
import type { Ui } from './ui.ts';
import { PageHeader } from '@/components/layout.tsx';

export interface Host {
  /** The vault's files, with the staged edits: what every feature reads. */
  files: VaultFile[];
  writer: Writer;
  secrets: Secrets | null;
  extensions: Extension[];
  /** Every MDX component the extensions provide. */
  mdx: Record<string, ComponentType<any>>;
  /** Search and previews: every extension's entries, and the nav's pages. */
  index: Map<string, Entry>;
  /** The backend's history since a day, where it keeps one (the audit). */
  since?: VaultBackend['since'];
  /** Where a file can be seen at its source, if the backend has one. */
  source?: VaultBackend['source'];
  /** The shell: panels, search, the shortcuts list, the sidebar (ui.ts). */
  ui: Ui;
}

export const HostContext = createContext<Host>(null!);
export const useHost = () => useContext(HostContext);
export const useWriter = () => useHost().writer;

const sorted = <T extends { order: number }>(xs: T[]) => [...xs].sort((a, b) => a.order - b.order);
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
