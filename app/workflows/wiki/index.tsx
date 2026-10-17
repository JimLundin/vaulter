import { useState, type ReactNode } from 'react';
import {
  Button,
  FeaturePage,
  Heading,
  Input,
  Link,
  Loader,
  ReadingColumn,
  PageHeader,
  PageControls,
  Row,
  SelectionRow,
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
    onNavigate(wikiRoute.href());
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
  const curated = wikiHome(matching);
  const { subjects } = wikiHome(pages);
  const passage = curated.featured.find((entry) => entry.excerpt);
  const directory = (
    <SupportingPane
      title="Pages"
      open={directoryOpen}
      persistent={true}
      onClose={() => setDirectoryOpen(false)}
    >
      <Stack as="section" aria-label="Page directory" gap="lg">
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
        <Stack gap="sm">
          {matching.map((entry) => (
            <SelectionRow
              key={entry.id}
              appearance="navigation"
              selected={false}
              aria-label={entry.title}
              onSelect={() => openPage(entry)}
            >
              <Stack gap="xs">
                <Text as="span" size="sm" weight="medium">
                  {entry.title}
                </Text>
                {!!entry.summary && (
                  <Text as="span" size="xs" tone="muted">
                    {entry.summary}
                  </Text>
                )}
              </Stack>
            </SelectionRow>
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
    <ReadingColumn label="Wiki home">
      <PageHeader title="Wiki" />
      <Row visible="compact">
        <PageControls actions={openDirectory} />
      </Row>
      <ReadingColumn page={true}>
        <Stack grow={true} inset="page" block="md" gap="lg">
          <Stack gap="sm">
            <Heading level={1} serif={true} size="title">
              Explore your wiki
            </Heading>
            <Text size="sm" tone="muted">
              Find what you know, revisit an idea, or follow a connection.
            </Text>
            <Input
              aria-label="Search wiki"
              placeholder="What would you like to find?"
              value={query}
              onChange={(event) => setQuery(event.currentTarget.value)}
            />
            {!!subjects.length && (
              <Select
                aria-label="Explore a subject"
                value={filter?.id ?? ''}
                options={[
                  { value: '', label: 'Explore all subjects' },
                  ...subjects.map(({ term, count }) => ({
                    value: term.id,
                    label: `${term.label} · ${count} ${count === 1 ? 'page' : 'pages'}`,
                  })),
                ]}
                onChange={(event) =>
                  setFilter(
                    subjects.find(({ term }) => term.id === event.currentTarget.value)?.term,
                  )
                }
              />
            )}
          </Stack>
          {!!passage && !search && !filter && (
            <Surface variant="subtle" as="section" aria-label="From your wiki">
              <Stack gap="xs">
                <Text size="xs" tone="muted">
                  From your wiki · {passage.page.title}
                </Text>
                <Text lines={3}>{passage.excerpt}</Text>
              </Stack>
            </Surface>
          )}
          {pages.length ? (
            <Stack grow={true} justify="center" gap="lg" as="section" aria-label="Starting pages">
              <Row justify="between">
                <Heading level={2}>{search || filter ? 'Matching pages' : 'Start here'}</Heading>
                {!!(search || filter) && (
                  <Button variant="ghost" onClick={reset}>
                    Clear filters
                  </Button>
                )}
              </Row>
              {curated.featured.map(({ page: entry, excerpt, connections }) => (
                <Stack key={entry.id} gap="xs" as="section" aria-label={entry.title}>
                  <Text size="lg" weight="medium" truncate={true}>
                    {pageLink(entry)}
                  </Text>
                  {!!(entry.summary.trim() || excerpt) && (
                    <Text size="sm" tone="muted" lines={3}>
                      {entry.summary.trim() || excerpt}
                    </Text>
                  )}
                  {!!connections && (
                    <Text size="xs" tone="muted">
                      Connects {connections} {connections === 1 ? 'other page' : 'other pages'}
                    </Text>
                  )}
                </Stack>
              ))}
              {!matching.length && (
                <Text size="sm" tone="muted">
                  No pages match. Try another word or clear your filters.
                </Text>
              )}
            </Stack>
          ) : (
            <Stack grow={true} justify="center" gap="sm">
              <Heading level={2}>Build on something you care about</Heading>
              <Text size="sm" tone="muted">
                Share notes, a project or an idea with your agent, then ask it to make a wiki page.
                Your pages will bring the knowledge together with links to its sources.
              </Text>
              <Link href="#/chat/" onClick={() => onNavigate('/chat/')}>
                Open Chat
              </Link>
            </Stack>
          )}
          {!!pages.length && (
            <Row justify="between">
              <Text size="xs" tone="muted">
                {matching.length} {matching.length === 1 ? 'page' : 'pages'}
                {search || filter ? ' found' : ' in your wiki'}
              </Text>
            </Row>
          )}
        </Stack>
      </ReadingColumn>
    </ReadingColumn>
  );
  if (page)
    return (
      <WikiPageView
        key={page.id}
        page={page}
        onBack={home}
        onFilter={filterTag}
        renderRecord={renderRecord}
        timeline={renderTimeline?.(page)}
      />
    );
  if (node)
    return (
      <FeaturePage title="Wiki">
        <Heading level={2}>Page unavailable</Heading>
        <Text>This page is missing or has been removed.</Text>
        <Button variant="ghost" onClick={home}>
          Wiki home
        </Button>
      </FeaturePage>
    );
  return <SplitView supporting={directory} main={frontPage} />;
}
