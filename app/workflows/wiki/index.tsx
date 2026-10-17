import { useState, type ReactNode } from 'react';
import {
  Badge,
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
  Icon,
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
  const [spotlight, setSpotlight] = useState(0);
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
  const curated = wikiHome(pages);
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
  const focused = curated.featured[spotlight % Math.max(1, curated.featured.length)];
  const passage = curated.passages.find((entry) => entry.page.id === focused?.page.id);
  const move = (direction: number) =>
    setSpotlight(
      (current) =>
        (current + direction + curated.featured.length) % Math.max(1, curated.featured.length),
    );
  const previous = (
    <Button
      variant="ghost"
      iconOnly={true}
      aria-label="Previous featured page"
      disabled={curated.featured.length < 2}
      onClick={() => move(-1)}
    >
      <Icon name="chevron-left" />
    </Button>
  );
  const next = (
    <Button
      variant="ghost"
      iconOnly={true}
      aria-label="Next featured page"
      disabled={curated.featured.length < 2}
      onClick={() => move(1)}
    >
      <Icon name="chevron-right" />
    </Button>
  );
  const frontPage = (
    <ReadingColumn label="Wiki home">
      <PageHeader title="Wiki" actions={openDirectory} />
      <ReadingColumn page={true}>
        <Stack grow={true} inset="page" block="md" gap="lg">
          <Stack gap="xs">
            <Heading level={2} serif={true} size="title">
              A place to begin.
            </Heading>
            <Text size="sm" tone="muted">
              Knowledge taking shape in your vault.
            </Text>
            <Badge variant="secondary">
              {pages.length} {pages.length === 1 ? 'page' : 'pages'}
            </Badge>
          </Stack>
          {focused ? (
            <Stack grow={true} justify="center" gap="lg" as="section" aria-label="In focus">
              <Text size="xs" tone="muted">
                In focus · {(spotlight % curated.featured.length) + 1} of {curated.featured.length}
              </Text>
              <Heading level={2} serif={true} size="title">
                {pageLink(focused.page)}
              </Heading>
              {!!focused.page.summary && (
                <Text tone="muted" lines={3}>
                  {focused.page.summary}
                </Text>
              )}
              {!!focused.connections && (
                <Text size="xs" tone="muted">
                  Linked from {focused.connections} {focused.connections === 1 ? 'page' : 'pages'}
                </Text>
              )}
              {!!passage && (
                <Surface variant="grouped" as="section" aria-label="From the pages">
                  <Text size="sm" tone="muted">
                    From the page
                  </Text>
                  <Text lines={4}>{passage.excerpt}</Text>
                </Surface>
              )}
              <Text size="xs" tone="muted">
                Open the page to explore its context and sources.
              </Text>
            </Stack>
          ) : (
            <Stack grow={true} justify="center" gap="sm">
              <Heading level={2}>Your wiki starts here</Heading>
              <Text tone="muted">
                Share something with your agent and ask it to create a wiki page.
              </Text>
            </Stack>
          )}
          {!!focused && (
            <Row justify="between" visible="expanded">
              <Text size="xs" tone="muted">
                Selected from page connections, sources and depth.
              </Text>
              <Row>
                {previous}
                {next}
              </Row>
            </Row>
          )}
          {!!focused && (
            <PageControls
              placement="rail"
              bottomActions={
                <>
                  {previous}
                  <Text size="sm">In focus</Text>
                  {next}
                </>
              }
            />
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
