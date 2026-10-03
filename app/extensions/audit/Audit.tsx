// The weekly sweep's audit (core/audit.ts) as a page: every section, the notes in it linked. The week's
// history comes from the backend (`since`), so the page shows only where the backend keeps one.
import { useEffect, useState } from 'react';
import { audit, daysBefore, esc, type Section } from '../../../core/audit.ts';
import { perVault, type Vault } from '../../../core/derive.ts';
import { today } from '../../../core/format.ts';
import { hrefOf, type Note } from '../../../core/note-fields.ts';
import type { Schema } from '../../../core/schema.ts';
import type { VaultBackend } from '../../core/backend.ts';
import { useHost, useVault } from '../../core/host.tsx';
import { link } from '../../core/route.ts';
import './audit.css';

const DAYS = 8;

/** This week's audit, as tools/audit.ts runs it by default. */
export async function weekAudit(
  notes: Note[],
  schema: Schema,
  since: NonNullable<VaultBackend['since']>,
) {
  const t = today();
  const day = daysBefore(t, DAYS);
  return audit(notes, schema, await since(day), t, day, `${DAYS} days ago`);
}

/** Any page path in a row, longest first. */
const paths = perVault(
  (v: Vault) =>
    new RegExp(
      `(${
        v.notes
          .map((n) => n.path)
          .sort((a, b) => b.length - a.length)
          .map(esc)
          .join('|') || '(?!)'
      })`,
    ),
);

function Row({ text }: { text: string }) {
  const v = useVault();
  return (
    <li>
      {text.split(paths(v)).map((s, i) =>
        i % 2 ? (
          // biome-ignore lint/suspicious/noArrayIndexKey: a piece of a split row; its position is its identity (a path can recur)
          <a key={i} href={link(hrefOf({ id: s.replace(/\.mdx?$/, '') }))}>
            {s}
          </a>
        ) : (
          s
        ),
      )}
    </li>
  );
}

export function Audit() {
  const { vault, since } = useHost();
  const [state, setState] = useState<{ sections?: Section[]; error?: string }>({});
  useEffect(() => {
    if (!since) return;
    let live = true;
    weekAudit(vault.notes, vault.schema, since).then(
      (s) => live && setState({ sections: s }),
      (e) => live && setState({ error: (e as Error).message }),
    );
    return () => {
      live = false;
    };
  }, [vault, since]);
  const { sections, error } = state;
  return (
    <div className="v-audit">
      <h1>Audit</h1>
      <p className="lede">
        What the weekly sweep (conventions §15) must judge, the last {DAYS} days. It changes
        nothing; fix each by hand.
      </p>
      {error ? (
        <p className="app-error">{error}</p>
      ) : !sections ? (
        <p className="app-loading">Auditing…</p>
      ) : (
        sections.map(({ title, rows }) => (
          <section key={title} className="sect">
            <h2>
              {title} <span>{rows.length}</span>
            </h2>
            {rows.length > 0 && (
              <ul>
                {rows.map((r) => (
                  <Row key={r} text={r} />
                ))}
              </ul>
            )}
          </section>
        ))
      )}
    </div>
  );
}
