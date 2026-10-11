import { useState } from 'react';
import { FeaturePage, Input, Link, Stack, Text, WikiPageSurface } from '../../ui/kit/index.ts';
import { pageRoute, type WikiBlock, type WikiPage } from './pages.ts';
import { WikiBlocks, WikiEvidence } from './rendering/blocks.tsx';

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
  const [selected, setSelected] = useState<WikiBlock | undefined>();
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
  if (page)
    return (
      <WikiPageSurface
        title={page.title}
        summary={page.summary}
        metadata={`${page.kind}${page.updated ? ` · updated ${new Date(page.updated).toLocaleDateString()}` : ''}`}
        evidence={
          selected && (
            <WikiEvidence
              block={
                page.blocks
                  .flatMap(function flatten(block): WikiBlock[] {
                    return [block, ...block.children.flatMap(flatten)];
                  })
                  .find((block) => block.id === selected.id) ?? selected
              }
            />
          )
        }
        onCloseEvidence={() => setSelected(undefined)}
      >
        <WikiBlocks blocks={page.blocks} onEvidence={setSelected} selected={selected?.id} />
      </WikiPageSurface>
    );
  const matching = pages.filter((entry) =>
    [entry.title, entry.summary, ...entry.entry.a].some((value) =>
      value.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
    ),
  );
  return (
    <FeaturePage title="Wiki" description="People, places and ideas in your vault.">
      <Stack>
        <Input
          aria-label="Find pages"
          placeholder="Find a page…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        {matching.map((entry) => (
          <Stack key={entry.id} gap="xs">
            <Link href={`#${pageRoute.href({ node: entry.id })}`}>{entry.title}</Link>
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
