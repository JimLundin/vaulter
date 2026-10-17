import type { WikiBlock, WikiClassification, WikiPage } from './view.ts';

function text(block: WikiBlock): string {
  if (block.data.kind === 'unavailable') return '';
  return typeof block.data.text === 'string' ? block.data.text : block.children.map(text).join('');
}
function links(blocks: WikiBlock[]): string[] {
  return blocks
    .filter((block) => block.data.kind !== 'unavailable')
    .flatMap((block) => [
      ...(block.href?.startsWith('#/wiki/') ? [block.href] : []),
      ...links(block.children),
    ]);
}

/** Choose useful entry points using actual links, source material and page content. */
export function wikiHome(pages: WikiPage[]) {
  const incoming = new Map<string, number>();
  for (const page of pages) {
    for (const href of new Set(links(page.blocks))) {
      if (href === `#${page.entry.href}`) continue;
      incoming.set(href, (incoming.get(href) ?? 0) + 1);
    }
  }
  const entries = pages
    .map((page) => {
      const passages = page.blocks
        .filter((block) => block.data.kind === 'paragraph')
        .map(text)
        .filter((value) => value.trim());
      const connections = incoming.get(`#${page.entry.href}`) ?? 0;
      return {
        page,
        excerpt: passages[0],
        connections,
        score: connections * 3 + page.sources.length + passages.length,
      };
    })
    .sort((a, b) => b.score - a.score || a.page.title.localeCompare(b.page.title));
  const subjects = new Map<string, { term: WikiClassification; count: number }>();
  for (const page of pages) {
    const terms = new Map(
      page.metadata
        .filter((term) => term.state === 'resolved' && ['topic', 'tag'].includes(term.scheme))
        .map((term) => [term.id, term]),
    );
    for (const term of terms.values()) {
      const existing = subjects.get(term.id);
      subjects.set(term.id, { term, count: (existing?.count ?? 0) + 1 });
    }
  }
  return {
    subjects: [...subjects.values()].sort(
      (a, b) => b.count - a.count || a.term.label.localeCompare(b.term.label),
    ),
    featured: entries.slice(0, 3),
  };
}
