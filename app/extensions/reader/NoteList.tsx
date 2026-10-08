// Live list of notes matching frontmatter. <NoteList type="person" tag="work" sort="created" />
import { link } from '../../core/route.ts';
import { titleOf, excerptOf, hrefOf, kind, asList } from '../notes/model/fields.ts';
import { dateStr } from '../../core/format.ts';
import { cn } from 'cn';
import { Empty } from '@/components/layout.tsx';
import { navRow } from './sections.tsx';
import { useGraph } from '../graph/use.ts';

interface Props {
  type?: string;
  tag?: string;
  sort?: 'title' | 'created';
  excerpt?: boolean;
}

export function NoteList({ type, tag, sort = 'title', excerpt = true }: Props) {
  const { notes } = useGraph();
  const hits = notes
    .filter((n) => kind(n.id) === 'note')
    .filter((n) => !type || (n.data as any).type === type)
    .filter((n) => !tag || asList((n.data as any).tags).includes(tag))
    .sort((a, b) =>
      sort === 'created'
        ? dateStr((b.data as any).created).localeCompare(dateStr((a.data as any).created))
        : titleOf(a).localeCompare(titleOf(b)),
    );
  if (!hits.length)
    return (
      <div className="not-prose my-4">
        <Empty>
          No notes match{type ? ` type “${type}”` : ''}
          {tag ? ` tag “${tag}”` : ''}.
        </Empty>
      </div>
    );
  return (
    <ul data-previews={true} className="not-prose my-4 list-none space-y-1 p-0">
      {hits.map((n) => (
        <li key={n.id} className={cn('leading-normal', navRow)}>
          <a
            data-nav={true}
            href={link(hrefOf(n))}
            className="font-medium no-underline outline-none hover:underline"
          >
            {titleOf(n)}
          </a>
          {excerpt && !!excerptOf(n, 140) && (
            <span className="text-muted-foreground"> — {excerptOf(n, 140)}</span>
          )}
        </li>
      ))}
    </ul>
  );
}
