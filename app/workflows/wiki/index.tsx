import { useState, type ReactNode } from 'react';
import {
  Badge,
  Button,
  Columns,
  FeaturePage,
  Heading,
  Input,
  Link,
  Loader,
  ScrollArea,
  Select,
  SplitView,
  Stack,
  Surface,
  SupportingPane,
  Text,
} from '@/ui/kit/index.ts';
import { go } from '@/navigation/routing.ts';
import type { WikiClassification, WikiPage } from './view.ts';
import { wikiRoute, pageRoute } from './routes.ts';
import { WikiPageView } from './WikiPageView.tsx';
import { wikiHome } from './home.ts';
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
  const [sort, setSort] = useState('title');
  const [directoryOpen, setDirectoryOpen] = useState(false);
  const openDirectory = (
    <Button
      variant="ghost"
      aria-label="Pages"
      compactIcon="list"
      onClick={() => setDirectoryOpen(true)}
    >
      Pages
    </Button>
  );
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
  const openPage = (entry: WikiPage) => {
    onNavigate(pageRoute.href({ node: entry.id }));
    setDirectoryOpen(false);
  };
  const home = () => {
    onNavigate(wikiRoute.href());
    setDirectoryOpen(false);
  };
  const filterTag = (term: WikiClassification) => {
    setFilter(term);
    setQuery('');
    setDirectoryOpen(true);
  };
  const reset = () => {
    setQuery('');
    setFilter(undefined);
  };
  const search = query.trim().toLocaleLowerCase();
  const matching = pages
    .filter(
      (entry) =>
        (!filter || entry.metadata.some((term) => term.id === filter.id)) &&
        [
          entry.title,
          entry.summary,
          ...entry.entry.a,
          ...entry.metadata.map((term) => term.label),
        ].some((value) => value.toLocaleLowerCase().includes(search)),
    )
    .sort((a, b) =>
      sort === 'reverse' ? b.title.localeCompare(a.title) : a.title.localeCompare(b.title),
    );
  const classifications = [
    ...new Map(pages.flatMap((entry) => entry.metadata).map((term) => [term.id, term])).values(),
  ].sort((a, b) => a.label.localeCompare(b.label));
  const pageLink = (entry: WikiPage) => (
    <Link href={`#${pageRoute.href({ node: entry.id })}`} onClick={() => openPage(entry)}>
      {entry.title}
    </Link>
  );
  const curated = wikiHome(pages);
  const directory = (
    <SupportingPane
      title="Pages"
      open={directoryOpen}
      persistent={true}
      onClose={() => setDirectoryOpen(false)}
    >
      <Stack as="section" aria-label="Page directory" gap="lg">
        <Link
          href={`#${wikiRoute.href()}`}
          onClick={home}
          aria-current={!node ? 'page' : undefined}
        >
          Wiki home
        </Link>
        <Input
          aria-label="Find pages"
          placeholder="Find a page or subject…"
          value={query}
          onChange={(event) => setQuery(event.currentTarget.value)}
        />
        {!!classifications.length && (
          <Select
            aria-label="Filter pages"
            value={filter?.id ?? ''}
            options={[
              { value: '', label: 'All subjects' },
              ...classifications.map((term) => ({ value: term.id, label: term.label })),
            ]}
            onChange={(event) =>
              setFilter(classifications.find((term) => term.id === event.currentTarget.value))
            }
          />
        )}
        {!!filter && <Heading level={3}>Pages tagged {filter.label}</Heading>}
        <Select
          aria-label="Sort pages"
          value={sort}
          onChange={(event) => setSort(event.currentTarget.value)}
          options={[
            { value: 'title', label: 'A to Z' },
            { value: 'reverse', label: 'Z to A' },
          ]}
        />
        <Text size="xs" tone="muted" role="status">
          {matching.length} of {pages.length} pages
        </Text>
        <Stack gap="lg">
          {matching.map((entry) => (
            <Surface key={entry.id} variant="subtle">
              <Link
                plain={true}
                href={`#${pageRoute.href({ node: entry.id })}`}
                onClick={() => openPage(entry)}
                aria-current={entry.id === node ? 'page' : undefined}
              >
                {entry.title}
              </Link>
              {!!entry.summary && (
                <Text size="xs" tone="muted">
                  {entry.summary}
                </Text>
              )}
            </Surface>
          ))}
        </Stack>
        {!matching.length && <Text>No pages found.</Text>}
        {!!(search || filter) && (
          <Button variant="ghost" onClick={reset}>
            Show all pages
          </Button>
        )}
      </Stack>
    </SupportingPane>
  );
  const frontPage = (
    <ScrollArea grow={true}>
      <FeaturePage title="Wiki" actions={openDirectory}>
        <Stack gap="xl" inset="page" block="md">
          <Stack gap="sm">
            <Text size="sm" tone="muted">
              Your wiki
            </Text>
            <Heading level={2} serif={true} size="display">
              A place to begin.
            </Heading>
            <Text size="lg" tone="muted">
              {curated.featured.length
                ? `From ${curated.featured.map((entry) => entry.page.title).join(', ')}, explore the knowledge taking shape in your vault.`
                : 'A home for the knowledge taking shape in your vault.'}
            </Text>
            <Badge variant="secondary">
              {pages.length} {pages.length === 1 ? 'page' : 'pages'}
            </Badge>
          </Stack>
          {!!curated.featured.length && (
            <Stack as="section" aria-label="In focus" gap="lg">
              <Heading level={2}>In focus</Heading>
              <Text size="sm" tone="muted">
                Starting points selected for their connections, source material and depth.
              </Text>
              <Columns count={2} gap="lg">
                {curated.featured.map(({ page: entry, connections }) => (
                  <Surface key={entry.id} variant="subtle">
                    <Heading level={3}>{pageLink(entry)}</Heading>
                    <Text tone="muted">
                      {entry.summary || 'Follow this page into the collection.'}
                    </Text>
                    {!!connections && (
                      <Text size="xs" tone="muted">
                        Linked from {connections} {connections === 1 ? 'page' : 'pages'}
                      </Text>
                    )}
                  </Surface>
                ))}
              </Columns>
            </Stack>
          )}
          {!!curated.passages.length && (
            <Stack as="section" aria-label="From the pages" gap="lg">
              <Heading level={2}>From the pages</Heading>
              {curated.passages.map(({ page: entry, excerpt }) => (
                <Surface key={entry.id} variant="grouped">
                  <Text size="lg" preserve={true}>
                    {excerpt}
                  </Text>
                  <Text size="sm">From {pageLink(entry)}</Text>
                </Surface>
              ))}
            </Stack>
          )}
          {!pages.length && (
            <Surface variant="subtle">
              <Heading level={2}>Your wiki starts here</Heading>
              <Text tone="muted">
                Share something with your agent and ask it to create a wiki page. As your collection
                grows, its pages and ideas will find a home here.
              </Text>
            </Surface>
          )}
          {!!pages.length && (
            <Text size="sm" tone="muted">
              These excerpts come from your wiki pages. Open a page to read its context and inspect
              the sources behind it.
            </Text>
          )}
        </Stack>
      </FeaturePage>
    </ScrollArea>
  );
  return (
    <SplitView
      supporting={directory}
      main={
        page ? (
          <WikiPageView
            key={page.id}
            page={page}
            onBack={home}
            onFilter={filterTag}
            renderRecord={renderRecord}
            timeline={renderTimeline?.(page)}
            actions={openDirectory}
          />
        ) : node ? (
          <FeaturePage title="Wiki" actions={openDirectory}>
            <Heading level={2}>Page unavailable</Heading>
            <Text>This page is missing or has been removed.</Text>
          </FeaturePage>
        ) : (
          frontPage
        )
      }
    />
  );
}
