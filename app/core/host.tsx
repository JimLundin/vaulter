// What every view can reach: the vault (and its schema), the writer, the secrets and the extensions. The
// shell (App.tsx) provides it. A feature's own places are its slots (slot.ts).
import { createContext } from 'react';
import { useContext } from 'react';
import type { ComponentType } from 'react';
import type { Vault } from '../extensions/graph/model/graph.ts';
import type { Secrets } from './sealed.ts';
import type { Heavy, HeavyKey } from '../extensions/heavy.ts';
import type { Extension, Page } from './extension.ts';
import type { Entry } from './search.ts';
import type { Writer } from './writer.ts';
import type { VaultBackend } from './backend.ts';
import { link } from './route.ts';
import type { Ui } from './ui.ts';
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
  /** The shell: panels, search, the shortcuts list, the sidebar (ui.ts). */
  ui: Ui;
}

export const HostContext = createContext<Host>(null!);
export const useHost = () => useContext(HostContext);
export const useVault = () => useHost().vault;
/** The vault's vocabulary (meta/schema.yaml): types, areas, statuses, circles, predicates. */
export const useSchema = () => useHost().vault.schema;
export const useWriter = () => useHost().writer;
/** A slow derivation (app/extensions/heavy.ts), or null until the worker has it. */
export const useHeavy = <K extends HeavyKey>(k: K): Heavy[K] | null => useHost().heavy[k] ?? null;

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
