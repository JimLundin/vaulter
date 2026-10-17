import { useState } from 'react';
import {
  Button,
  FeaturePage,
  Heading,
  PageControls,
  Link,
  Loader,
  Stack,
  Text,
} from '../../ui/kit/index.ts';
import { go } from '../../navigation/routing.ts';
import type { WikiClassification, WikiPage } from './pages.ts';
import { wikiRoute, pageRoute } from './routes.ts';
import { WikiPageView } from './WikiPageView.tsx';
import type { ForeignRecordRenderer } from './rendering/blocks.tsx';
export { WikiPageView } from './WikiPageView.tsx';
export type { ForeignRecordRenderer } from './rendering/blocks.tsx';

export function Wiki({
  pages,
  node,
  error,
  onNavigate = go,
  renderRecord,
}: {
  pages: WikiPage[] | null;
  node?: string;
  error?: string;
  onNavigate?: (path: string) => void;
  renderRecord?: ForeignRecordRenderer;
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
      <FeaturePage title="Wiki">
        <Heading level={2}>Page unavailable</Heading>
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
        renderRecord={renderRecord}
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
  const classifications = [
    ...new Map(
      [...(filter ? [filter] : []), ...pages.flatMap((entry) => entry.metadata)].map((term) => [
        term.id,
        term,
      ]),
    ).values(),
  ].sort((a, b) => a.label.localeCompare(b.label));
  return (
    <FeaturePage title="Wiki" description="People, places and ideas in your vault.">
      <Stack>
        {!!filter && <Heading level={2}>Pages tagged {filter.label}</Heading>}
        <PageControls
          search={{
            label: 'Find pages',
            placeholder: 'Find a page, subject or tag…',
            value: query,
            onValueChange: setQuery,
          }}
          filters={{
            type: 'single',
            label: 'Pages',
            value: filter?.id ?? '',
            options: [
              { value: '', label: 'All pages' },
              ...classifications.map((term) => ({ value: term.id, label: term.label })),
            ],
            active: !!filter,
            onValueChange: (value) => setFilter(classifications.find((term) => term.id === value)),
          }}
        >
          {filter ? (
            <Button variant="ghost" onClick={() => setFilter(undefined)}>
              Clear {filter.label} filter ×
            </Button>
          ) : null}
        </PageControls>
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
