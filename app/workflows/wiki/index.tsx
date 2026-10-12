import { useState } from 'react';
import { Button, FeaturePage, Input, Link, Loader, Stack, Text } from '../../ui/kit/index.ts';
import { go } from '../../ui/routing.ts';
import type { WikiClassification, WikiPage } from './pages.ts';
import { wikiRoute, pageRoute } from './routes.ts';
import { WikiPageView } from './WikiPageView.tsx';
export { WikiPageView } from './WikiPageView.tsx';

export function Wiki({
  pages,
  node,
  error,
  onNavigate = go,
}: {
  pages: WikiPage[] | null;
  node?: string;
  error?: string;
  onNavigate?: (path: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<WikiClassification>();
  const [showIndex, setShowIndex] = useState(false);
  if (error)
    return (
      <FeaturePage title="Wiki">
        <Text role="alert" tone="danger">
          {error}
        </Text>
      </FeaturePage>
    );
  if (!pages)
    return (
      <FeaturePage title="Wiki">
        <Loader>Opening pages…</Loader>
      </FeaturePage>
    );
  const page = pages.find((entry) => entry.id === node);
  if (node && !page)
    return (
      <FeaturePage title="Page unavailable">
        <Text>This page is missing or has been removed.</Text>
      </FeaturePage>
    );
  const filterTag = (term: WikiClassification) => {
    setFilter(term);
    setQuery('');
    setShowIndex(true);
  };
  if (page && !showIndex)
    return (
      <WikiPageView
        key={page.id}
        page={page}
        onBack={() => onNavigate(wikiRoute.href())}
        onFilter={filterTag}
      />
    );
  const matching = pages.filter(
    (entry) =>
      (!filter || entry.metadata.some((term) => term.id === filter.id)) &&
      [
        entry.title,
        entry.summary,
        ...entry.entry.a,
        ...entry.metadata.map((term) => term.label),
      ].some((value) => value.toLocaleLowerCase().includes(query.toLocaleLowerCase())),
  );
  return (
    <FeaturePage
      title={filter ? `Pages tagged ${filter.label}` : 'Wiki'}
      description="People, places and ideas in your vault."
    >
      <Stack>
        <Input
          aria-label="Find pages"
          placeholder="Find a page, subject or tag…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        {!!filter && (
          <Button variant="ghost" onClick={() => setFilter(undefined)}>
            Clear {filter.label} filter ×
          </Button>
        )}
        {matching.map((entry) => (
          <Stack key={entry.id} gap="xs">
            <Link
              href={`#${pageRoute.href({ node: entry.id })}`}
              onClick={() => {
                onNavigate(pageRoute.href({ node: entry.id }));
                setShowIndex(false);
              }}
            >
              {entry.title}
            </Link>
            {!!entry.summary && (
              <Text size="sm" tone="muted">
                {entry.summary}
              </Text>
            )}
          </Stack>
        ))}
        {!matching.length && <Text>No pages found.</Text>}
      </Stack>
    </FeaturePage>
  );
}
