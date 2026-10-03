// Live list of notes matching frontmatter. <NoteList type="person" tag="work" sort="created" />
import { useVault } from '../../core/host.tsx';
import { link } from '../../core/route.ts';
import { titleOf, excerptOf, hrefOf, kind, asList } from '../../../core/note-fields.ts';
import { dateStr } from '../../../core/format.ts';

interface Props {
  type?: string;
  tag?: string;
  sort?: 'title' | 'created';
  excerpt?: boolean;
}

export function NoteList({ type, tag, sort = 'title', excerpt = true }: Props) {
  const { notes } = useVault();
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
      <p className="empty">
        No notes match{type ? ` type “${type}”` : ''}
        {tag ? ` tag “${tag}”` : ''}.
      </p>
    );
  return (
    <ul className="notelist">
      {hits.map((n) => (
        <li key={n.id}>
          <a href={link(hrefOf(n))}>{titleOf(n)}</a>
          {excerpt && excerptOf(n, 140) && <span> — {excerptOf(n, 140)}</span>}
        </li>
      ))}
    </ul>
  );
}
