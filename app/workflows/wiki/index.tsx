import { useState } from 'react';
import {
  Button,
  Chip,
  FeaturePage,
  Input,
  Link,
  Stack,
  Text,
  WikiPageSurface,
} from '../../ui/kit/index.ts';
import { go } from '../../ui/routing.ts';
import {
  wikiRoute,
  pageRoute,
  type WikiBlock,
  type WikiClassification,
  type WikiPage,
} from './pages.ts';
import { WikiBlocks } from './rendering/blocks.tsx';
import { ReferenceCard } from './rendering/references.tsx';

const titleCase = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);

export function Wiki({
  pages,
  node,
  error,
}: {
  pages: WikiPage[] | null;
  node?: string;
  error?: string;
}) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<WikiBlock>();
  const [referencesOpen, setReferencesOpen] = useState(false);
  const [filter, setFilter] = useState<WikiClassification>();
  const [showIndex, setShowIndex] = useState(false);
  const [allTags, setAllTags] = useState(false);
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
        <Text>Opening pages…</Text>
      </FeaturePage>
    );
  const page = pages.find((entry) => entry.id === node);
  if (node && !page)
    return (
      <FeaturePage title="Page unavailable">
        <Text>This page is missing or has been removed.</Text>
      </FeaturePage>
    );
  const showPageReferences = () => {
    setSelected(undefined);
    setReferencesOpen(true);
  };
  const filterTag = (term: WikiClassification) => {
    setFilter(term);
    setQuery('');
    setShowIndex(true);
    setReferencesOpen(false);
  };
  if (page && !showIndex) {
    const references = selected?.evidence ?? page.sources;
    const facets = page.metadata.filter((term) => !['tag', 'topic', 'type'].includes(term.scheme));
    const tags = page.metadata.filter((term) => ['tag', 'topic'].includes(term.scheme));
    const connections = page.blocks.filter((block) => block.data.kind === 'relationship');
    const records = page.blocks.filter((block) =>
      ['question', 'task', 'decision', 'date', 'timeline'].includes(String(block.data.kind)),
    );
    const body = page.blocks.filter(
      (block) => !(connections.includes(block) || records.includes(block)),
    );
    const chip = (term: WikiClassification) => (
      <Chip key={term.relationship} label={titleCase(term.scheme)} onClick={() => filterTag(term)}>
        {term.label}
      </Chip>
    );
    return (
      <WikiPageSurface
        title={page.title}
        summary={page.summary}
        metadata={
          <>
            <Chip label="Type">{titleCase(page.kind)}</Chip>
            {facets.map(chip)}
          </>
        }
        subjectTags={
          tags.length ? (
            <>
              {(allTags ? tags : tags.slice(0, 5)).map(chip)}
              {tags.length > 5 && (
                <Chip onClick={() => setAllTags(!allTags)}>
                  {allTags ? 'Show fewer' : `+${tags.length - 5} tags`}
                </Chip>
              )}
            </>
          ) : undefined
        }
        referencesOpen={referencesOpen}
        onShowReferences={showPageReferences}
        onCloseEvidence={() => {
          setReferencesOpen(false);
          setSelected(undefined);
        }}
        onBack={() => go(wikiRoute.href())}
        referenceKey={selected?.id ?? 'page'}
        connections={
          !!connections.length && (
            <WikiBlocks
              blocks={connections}
              selected={selected?.id}
              onEvidence={(block) => {
                setSelected(block);
                setReferencesOpen(true);
              }}
            />
          )
        }
        records={
          !!records.length && (
            <WikiBlocks
              blocks={records}
              selected={selected?.id}
              onEvidence={(block) => {
                setSelected(block);
                setReferencesOpen(true);
              }}
            />
          )
        }
        evidence={
          references.length ? (
            references.map((reference) => (
              <ReferenceCard key={reference.id} reference={reference} />
            ))
          ) : (
            <Text tone="muted">This page has no recorded page sources yet.</Text>
          )
        }
      >
        <WikiBlocks
          blocks={body}
          selected={selected?.id}
          onEvidence={(block) => {
            setSelected(block);
            setReferencesOpen(true);
          }}
        />
      </WikiPageSurface>
    );
  }
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
                go(pageRoute.href({ node: entry.id }));
                setShowIndex(false);
                setSelected(undefined);
                setReferencesOpen(false);
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
