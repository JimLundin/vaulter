import { useState, type ReactNode } from 'react';
import {
  Button,
  Chip,
  Heading,
  Page,
  Prose,
  ReadingColumn,
  Row,
  ScrollArea,
  SplitView,
  Stack,
  Surface,
  SupportingPane,
  Text,
  PageHeader,
} from '@/ui/kit/index.ts';
import type { WikiBlock, WikiClassification, WikiPage } from './view.ts';
import { WikiBlocks, type ForeignRecordRenderer } from './rendering/blocks.tsx';
import { ReferenceCard } from './rendering/references.tsx';
import { SupportIndicators } from './support.tsx';

const titleCase = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);

/** Wiki interpretation and local reference selection consume resolved records and task actions. */
export function WikiPageView({
  page,
  onBack,
  onFilter,
  renderRecord,
  timeline,
  relatedRecords,
}: {
  page: WikiPage;
  onBack: () => void;
  onFilter: (term: WikiClassification) => void;
  renderRecord?: ForeignRecordRenderer;
  timeline?: ReactNode;
  relatedRecords?: ReactNode;
}) {
  const [selected, setSelected] = useState<WikiBlock>();
  const [referencesOpen, setReferencesOpen] = useState(false);
  const [allTags, setAllTags] = useState(false);
  const references = selected?.evidence ?? page.sources;
  const selection = selected?.id ?? 'page';
  const showPageReferences = () => {
    setSelected(undefined);
    setReferencesOpen(true);
  };
  const selectEvidence = (block: WikiBlock) => {
    setSelected(block);
    setReferencesOpen(true);
  };
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
    <Chip key={term.relationship} label={titleCase(term.scheme)} onClick={() => onFilter(term)}>
      {term.label}
    </Chip>
  );
  const blocks = (content: WikiBlock[]) => (
    <Prose>
      <WikiBlocks
        blocks={content}
        selected={selected?.id}
        onEvidence={selectEvidence}
        renderRecord={renderRecord}
      />
    </Prose>
  );
  return (
    <SplitView
      main={
        <ReadingColumn label="Wiki reading">
          <PageHeader title="Wiki" label="Wiki page" onBack={onBack} />
          <ScrollArea grow={true}>
            <Page>
              <Stack gap="lg" as="header">
                <Heading level={1} serif={true}>
                  <Button
                    variant="inline"
                    onClick={showPageReferences}
                    aria-description="Open page references"
                  >
                    {page.title}
                  </Button>
                </Heading>
                <Row as="fieldset" wrap={true} aria-label="Subject classification">
                  <Chip label="Type">{titleCase(page.kind)}</Chip>
                  {facets.map(chip)}
                </Row>
                {!!page.summary && (
                  <Stack gap="xs">
                    <Prose>
                      <Text size="lg">{page.summary}</Text>
                    </Prose>
                    <SupportIndicators state={page.summarySupport} />
                    {!!page.summaryEvidence?.length && (
                      <Button
                        variant="inline"
                        onClick={() =>
                          selectEvidence({
                            id: `${page.id}:summary`,
                            data: { kind: 'summary' },
                            children: [],
                            evidence: page.summaryEvidence!,
                          })
                        }
                      >
                        Summary evidence
                      </Button>
                    )}
                  </Stack>
                )}
                {!!tags.length && (
                  <Row as="fieldset" wrap={true} aria-label="Subject tags">
                    {(allTags ? tags : tags.slice(0, 5)).map(chip)}
                    {tags.length > 5 && (
                      <Chip onClick={() => setAllTags(!allTags)}>
                        {allTags ? 'Show fewer' : `+${tags.length - 5} tags`}
                      </Chip>
                    )}
                  </Row>
                )}
              </Stack>
              {blocks(body)}
              {timeline}
              {relatedRecords}
              {!!connections.length && (
                <Surface variant="grouped" as="section">
                  <Heading>Connections</Heading>
                  {blocks(connections)}
                </Surface>
              )}
              {!!records.length && (
                <Surface variant="grouped" as="section">
                  <Heading>Questions &amp; next steps</Heading>
                  {blocks(records)}
                </Surface>
              )}
            </Page>
          </ScrollArea>
        </ReadingColumn>
      }
      supporting={
        <SupportingPane
          title="References"
          open={referencesOpen}
          persistent={true}
          selection={selection}
          onClose={() => {
            setReferencesOpen(false);
            setSelected(undefined);
          }}
        >
          <Stack key={selection} gap="xl">
            {references.length ? (
              references.map((reference) => (
                <ReferenceCard key={reference.id} reference={reference} />
              ))
            ) : (
              <Text tone="muted">This page has no recorded page sources yet.</Text>
            )}
          </Stack>
        </SupportingPane>
      }
    />
  );
}
