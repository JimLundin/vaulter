// Dated events in order. <Timeline items={[{date: "2026-06-12", text: "…", href: "/Ada.md"}]} />
import { siteHref } from '../../../core/paths.ts';
import { isSafeUrl } from '../../../core/safe-url.ts';
import { link } from '../../core/route.ts';

interface Item {
  date: string;
  text: string;
  href?: string;
}
interface Props {
  items?: Item[];
  order?: 'asc' | 'desc';
}

export function Timeline({ items = [], order = 'asc' }: Props) {
  const sorted = [...items].sort(
    (a, b) => (order === 'asc' ? 1 : -1) * String(a.date).localeCompare(String(b.date)),
  );
  return (
    <ol className="timeline">
      {sorted.map((it) => (
        <li key={`${it.date}|${it.text}`}>
          <time>{it.date}</time>
          <div>
            {it.href && isSafeUrl(it.href) ? (
              <a
                className="vault-link"
                href={it.href.startsWith('/') ? link(siteHref(it.href)) : it.href}
              >
                {it.text}
              </a>
            ) : (
              it.text
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}
