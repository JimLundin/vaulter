// The weekly sweep's audit (core/audit.ts) as a page: every section, the notes in it linked. The week's
// history comes from the backend (`since`), so the page shows only where the backend keeps one.
import { useEffect, useState } from 'react';
import { esc, type Section as AuditSection } from '../../../core/audit.ts';
import { WEEK, weekAudit } from './week.ts';
import { perVault, type Vault } from '../../../core/derive.ts';
import { hrefOf } from '../../../core/note-fields.ts';
import { useHost, useVault } from '../../core/host.tsx';
import { link } from '../../core/route.ts';
import { Empty, ErrorState, Loading, PageHeader, Section } from '@/components/layout.tsx';

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
    <li className="px-3 py-2 text-sm [overflow-wrap:anywhere] has-[[data-nav]:focus-visible]:bg-accent/60">
      {text.split(paths(v)).map((s, i) =>
        i % 2 ? (
          <a
            // biome-ignore lint/suspicious/noArrayIndexKey: a piece of a split row; its position is its identity (a path can recur)
            key={i}
            // The row's first note is where j/k stop.
            data-nav={i === 1 || undefined}
            className="-mx-0.5 rounded-sm px-0.5 font-medium text-primary no-underline hover:underline data-[nav]:focus-visible:bg-accent data-[nav]:focus-visible:outline-2"
            href={link(hrefOf({ id: s.replace(/\.mdx?$/, '') }))}
          >
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
  const [state, setState] = useState<{ sections?: AuditSection[]; error?: string }>({});
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
      <PageHeader
        title="Audit"
        lede={`What the weekly sweep (conventions §15) must judge, the last ${WEEK} days. It changes nothing; fix each by hand.`}
      />
      {error ? (
        <ErrorState>{error}</ErrorState>
      ) : !sections ? (
        <Loading shape="list">Auditing…</Loading>
      ) : (
        sections.map(({ title, rows }) => (
          <Section key={title} title={title} count={rows.length}>
            {rows.length > 0 ? (
              <ul className="m-0 list-none divide-y rounded-lg border p-0">
                {rows.map((r) => (
                  <Row key={r} text={r} />
                ))}
              </ul>
            ) : (
              <Empty>Nothing.</Empty>
            )}
          </Section>
        ))
      )}
    </div>
  );
}
