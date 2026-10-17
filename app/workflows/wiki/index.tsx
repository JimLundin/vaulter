import { useState, type ReactNode } from 'react';
import {
  Badge,
  Button,
  Columns,
  FeaturePage,
  Heading,
  PageControls,
  Link,
  Loader,
  Row,
  Select,
  Separator,
  Surface,
  Stack,
  Text,
} from '@/ui/kit/index.ts';
import { go } from '@/navigation/routing.ts';
import type { WikiClassification, WikiPage } from './view.ts';
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
  renderTimeline,
}: {
  pages: WikiPage[] | null;
  node?: string;
  error?: string;
  onNavigate?: (path: string) => void;
  renderRecord?: ForeignRecordRenderer;
  renderTimeline?: (page: WikiPage) => ReactNode;
}) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<WikiClassification>();
  const [showIndex, setShowIndex] = useState(false);
  const [sort, setSort] = useState('title');
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
        timeline={renderTimeline?.(page)}
      />
    );
  const search = query.trim().toLocaleLowerCase();
  const matching = pages.filter(
    (entry) =>
      (!filter || entry.metadata.some((term) => term.id === filter.id)) &&
      [
        entry.title,
        entry.summary,
        ...entry.entry.a,
        ...entry.metadata.map((term) => term.label),
      ].some((value) => value.toLocaleLowerCase().includes(search)),
  );
  const classifications = [
    ...new Map(
      [...(filter ? [filter] : []), ...pages.flatMap((entry) => entry.metadata)].map((term) => [
        term.id,
        term,
      ]),
    ).values(),
  ].sort((a, b) => a.label.localeCompare(b.label));
  const byTitle = (a: WikiPage, b: WikiPage) => a.title.localeCompare(b.title);
  const featured = [...pages].sort(byTitle).slice(0, 3);
  const ordered = matching.sort((a, b) => (sort === 'reverse' ? byTitle(b, a) : byTitle(a, b)));
  const browsing = !(search || filter);
  const openPage = (entry: WikiPage) => {
    onNavigate(pageRoute.href({ node: entry.id }));
    setShowIndex(false);
  };
  const pageLink = (entry: WikiPage) => (
    <Link
      plain={true}
      href={`#${pageRoute.href({ node: entry.id })}`}
      onClick={() => openPage(entry)}
    >
      {entry.title}
    </Link>
  );
  const reset = () => {
    setQuery('');
    setFilter(undefined);
  };
  return (
    <FeaturePage title="Wiki" width="wide">
      <Stack gap="xl" inset="page" block="md">
        <Stack gap="sm">
          <Text size="sm" tone="muted">
            Your knowledge, connected
          </Text>
          <Heading level={2} serif={true} size="display">
            A place to begin.
          </Heading>
          <Text size="lg" tone="muted">
            Explore what you know about the people, places and ideas in your vault. Each page brings
            knowledge together, with references back to its sources.
          </Text>
          <Row wrap={true}>
            <Badge variant="secondary">
              {pages.length} {pages.length === 1 ? 'page' : 'pages'}
            </Badge>
            {!!classifications.length && (
              <Badge variant="secondary">
                {classifications.length} {classifications.length === 1 ? 'tag' : 'tags'}
              </Badge>
            )}
          </Row>
        </Stack>
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
          {!!filter && (
            <Button variant="ghost" onClick={() => setFilter(undefined)}>
              Clear {filter.label} filter ×
            </Button>
          )}
        </PageControls>
        {browsing && !!featured.length && (
          <Stack as="section" aria-label="Start exploring" gap="lg">
            <Stack gap="xs">
              <Heading level={2}>Start exploring</Heading>
              <Text size="sm" tone="muted">
                A few pages from your collection to help you find a way in.
              </Text>
            </Stack>
            <Columns count={3} gap="lg">
              {featured.map((entry) => (
                <Surface key={entry.id} variant="subtle">
                  <Stack gap="sm">
                    <Heading level={3}>{pageLink(entry)}</Heading>
                    <Text size="sm" tone="muted">
                      {entry.summary || 'Open this page to explore its knowledge and sources.'}
                    </Text>
                  </Stack>
                </Surface>
              ))}
            </Columns>
          </Stack>
        )}
        <Stack as="section" aria-label="Page directory" gap="lg">
          <Row wrap={true} justify="between" align="start">
            <Stack gap="xs">
              <Heading level={2}>
                {filter ? `Pages tagged ${filter.label}` : search ? 'Search results' : 'All pages'}
              </Heading>
              <Text size="sm" tone="muted" role="status">
                {search || filter
                  ? `${matching.length} of ${pages.length} pages${search ? ` matching “${query.trim()}”` : ''}`
                  : 'Browse the collection, or search for something specific.'}
              </Text>
            </Stack>
          </Row>
          {!!pages.length && (
            <Select
              aria-label="Sort pages"
              value={sort}
              onChange={(event) => setSort(event.currentTarget.value)}
              options={[
                { value: 'title', label: 'Alphabetical · A to Z' },
                { value: 'reverse', label: 'Alphabetical · Z to A' },
              ]}
            />
          )}
          {ordered.map((entry) => (
            <Stack key={entry.id} gap="sm" as="section" aria-label={entry.title}>
              <Separator />
              <Heading level={3}>{pageLink(entry)}</Heading>
              <Text tone="muted">
                {entry.summary || 'Open this page to explore its knowledge and sources.'}
              </Text>
              {!!entry.metadata.length && (
                <Row wrap={true}>
                  {entry.metadata.map((term) => (
                    <Button
                      key={term.id}
                      size="compact"
                      variant="ghost"
                      onClick={() => filterTag(term)}
                    >
                      {term.label}
                    </Button>
                  ))}
                </Row>
              )}
            </Stack>
          ))}
          {!matching.length && (
            <Surface variant="subtle">
              <Heading level={2}>
                {pages.length ? 'No pages found.' : 'Your wiki starts here'}
              </Heading>
              <Text tone="muted">
                {pages.length
                  ? 'Try a different search or clear your filters to explore the collection.'
                  : 'As knowledge is added to your vault, its wiki pages will appear here. Start by sharing something with your agent and asking it to create a wiki page.'}
              </Text>
              {!!pages.length && (
                <Button variant="outline" onClick={reset}>
                  Show all pages
                </Button>
              )}
            </Surface>
          )}
        </Stack>
        {browsing && !!pages.length && (
          <Surface variant="subtle" as="section" aria-label="About your wiki">
            <Heading level={2}>Knowledge with context</Heading>
            <Text size="sm" tone="muted">
              Open a page to read its full story. References take you back to the original material,
              and evidence indicators show which statements have been reviewed against a source.
            </Text>
          </Surface>
        )}
      </Stack>
    </FeaturePage>
  );
}
