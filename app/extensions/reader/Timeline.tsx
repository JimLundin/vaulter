// Dated events in order. <Timeline items={[{date: "2026-06-12", text: "…", href: "/Ada.md"}]} />
import { siteHref } from '../notes/model/paths.ts';
import { isSafeUrl } from '../notes/model/safe-url.ts';
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
    <ol className="not-prose my-6 ml-1.5 list-none border-l-2 py-0 pr-0 pl-5 [&_time]:block [&_time]:text-xs [&_time]:text-faint [&_time]:tabular-nums">
      {sorted.map((it) => (
        <li
          key={`${it.date}|${it.text}`}
          className="relative mb-4 last:mb-0 before:absolute before:top-1.5 before:-left-[calc(1.25rem+6px)] before:size-2.5 before:rounded-full before:bg-chart-1 before:ring-3 before:ring-background before:content-['']"
        >
          <time>{it.date}</time>
          <div className="leading-normal">
            {it.href && isSafeUrl(it.href) ? (
              <a
                className="vault-link no-underline hover:underline"
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
