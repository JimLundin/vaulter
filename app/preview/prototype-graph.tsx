// Throwaway evidence-first comparison. Wiki supplies resolved statements and retained passages.
import { useState, type ComponentProps } from 'react';
import type { OpenApplication } from '../application/index.tsx';
import {
  Badge,
  Button,
  Card,
  CardContent,
  Columns,
  FeaturePage,
  Heading,
  Icon,
  Link,
  Loader,
  PageControls,
  Row,
  SelectionRow,
  Separator,
  Stack,
  Surface,
  Text,
  Timeline,
  TimelineItem,
} from '../ui/kit/index.ts';

export const graphDesigns = [
  { id: 'briefing', label: 'A · Topic briefing' },
  { id: 'trail', label: 'B · Evidence trail' },
  { id: 'review', label: 'C · Source review' },
] as const;

type Props = Parameters<NonNullable<ComponentProps<typeof OpenApplication>['renderGraph']>>[0];
type Block = Props['topics'][number]['blocks'][number];
type Reference = Block['evidence'][number];
const words = (block: Block): string =>
  typeof block.data.text === 'string' ? block.data.text : block.children.map(words).join('');
const flatten = (blocks: Block[]): Block[] =>
  blocks.flatMap((block) => [block, ...flatten(block.children)]);
const sourceState = (reference: Reference) =>
  reference.state === 'newer'
    ? 'Source changed'
    : reference.state === 'deleted'
      ? 'Source removed'
      : 'Recorded source';

export function GraphPrototype({
  topics,
  node,
  state,
  onSelectSubject,
  currentSourceText,
  design,
}: Props & { design: string }) {
  const [query, setQuery] = useState('');
  const [chosen, setChosen] = useState<string>();
  const [filter, setFilter] = useState('all');
  const [browse, setBrowse] = useState(false);
  const [visibleCount, setVisibleCount] = useState(6);
  const topic =
    topics.find((entry) => entry.id === node) ??
    topics.find((entry) => entry.id === 'preview:graph-topic') ??
    topics[0];
  const all = flatten(topic?.blocks ?? []);
  const vaultBlocks = topics.flatMap((entry) => flatten(entry.blocks));
  const vaultStatements = vaultBlocks.filter(
    (block) => block.data.kind === 'paragraph' && words(block).trim(),
  );
  const vaultSources = new Set(
    vaultStatements.flatMap((block) => block.evidence.map((reference) => reference.source.node)),
  );
  const vaultQuestions = vaultBlocks.filter((block) => block.data.kind === 'question');
  const related = topics.filter(
    (entry) =>
      entry.id !== topic?.id &&
      state.graph
        ?.relationships({ node: topic?.id ?? '' })
        .some(
          (edge) =>
            edge.source.address?.node === entry.id || edge.target.address?.node === entry.id,
        ),
  );
  const statements = all.filter((block) => block.data.kind === 'paragraph' && words(block).trim());
  const questions = all.filter((block) => block.data.kind === 'question');
  const selected = statements.find((block) => block.id === chosen) ?? statements[0];
  const cited = statements.filter((block) => block.evidence.length > 0);
  const references = [
    ...new Map(
      [...statements.flatMap((block) => block.evidence), ...(topic?.sources ?? [])].map(
        (reference) => [JSON.stringify(reference.source), reference],
      ),
    ).values(),
  ];
  const changed = references.filter((reference) => reference.state !== 'original');
  const matching = statements.filter(
    (block) =>
      filter === 'all' ||
      (filter === 'cited' ? block.evidence.length > 0 : block.evidence.length === 0),
  );
  const selectTopic = (id: string) => {
    setChosen(undefined);
    setFilter('all');
    setVisibleCount(6);
    setBrowse(false);
    setQuery('');
    onSelectSubject(id);
  };
  const source = (reference: Reference) => (
    <Stack gap="sm" key={reference.id}>
      <Row justify="between" wrap={true}>
        <Heading level={3}>{reference.title}</Heading>
        <Badge variant="secondary">{sourceState(reference)}</Badge>
      </Row>
      <Text>“{reference.text}”</Text>
      {reference.state === 'newer' && (
        <Surface variant="subtle">
          <Text size="sm" weight="medium">
            SOURCE NOW SAYS
          </Text>
          <Text>
            {currentSourceText(reference.source.node) ?? 'The current source text is unavailable.'}
          </Text>
        </Surface>
      )}
      <Text size="sm" tone="muted">
        {reference.state === 'newer'
          ? 'The source has changed since this passage was cited. This quotation preserves the original evidence.'
          : reference.state === 'deleted'
            ? 'The source was removed. Its cited passage is still retained in history.'
            : 'This is the passage selected when the statement was cited.'}
      </Text>
      {topics.some(
        (entry) =>
          entry.id !== topic?.id &&
          flatten(entry.blocks).some((block) =>
            block.evidence.some((ref) => ref.source.node === reference.source.node),
          ),
      ) && (
        <Stack gap="xs">
          <Text size="sm" tone="muted">
            This source also appears in
          </Text>
          <Row wrap={true}>
            {topics
              .filter(
                (entry) =>
                  entry.id !== topic?.id &&
                  flatten(entry.blocks).some((block) =>
                    block.evidence.some((ref) => ref.source.node === reference.source.node),
                  ),
              )
              .map((entry) => (
                <Button
                  key={entry.id}
                  variant="ghost"
                  size="compact"
                  onClick={() => selectTopic(entry.id)}
                >
                  {entry.title}
                </Button>
              ))}
          </Row>
        </Stack>
      )}
      {!!reference.href && (
        <Link href={reference.href}>
          Open source <Icon name="arrow-up-right" size="sm" />
        </Link>
      )}
    </Stack>
  );
  const evidence = (block: Block) => (
    <Stack gap="lg">
      {block.evidence.length ? (
        block.evidence.map(source)
      ) : (
        <Surface variant="subtle">
          <Heading level={3}>No statement citation</Heading>
          <Text>
            This statement has no selected supporting passage. References attached to the topic do
            not establish support for this statement.
          </Text>
        </Surface>
      )}
    </Stack>
  );
  const statement = (block: Block) => (
    <SelectionRow
      key={block.id}
      selected={block.id === selected?.id}
      onSelect={() => setChosen(block.id)}
      appearance="card"
    >
      <Stack gap="sm">
        <Text size="sm" tone="muted">
          STATEMENT {statements.indexOf(block) + 1}
        </Text>
        <Text weight="medium">{words(block)}</Text>
        <Text size="sm" tone="muted">
          {block.evidence.length
            ? `${block.evidence.length} selected supporting passage${block.evidence.length === 1 ? '' : 's'}`
            : 'No statement citation'}
          {block.evidence.some((ref) => ref.state !== 'original') ? ' · Source needs review' : ''}
        </Text>
      </Stack>
    </SelectionRow>
  );
  const openQuestions = (
    <Stack gap="sm">
      <Heading level={2}>What remains open · {questions.length}</Heading>
      {questions.length ? (
        questions.map((question) => (
          <Surface key={question.id} variant="subtle">
            <Row>
              <Icon name="help" />
              <Text weight="medium">{String(question.data.text ?? 'Open question')}</Text>
            </Row>
            {state.graph?.relationships({ node: question.id }).map((edge) => {
              const endpoint = edge.direction === 'outgoing' ? edge.target : edge.source;
              const claim = vaultStatements.find((block) => block.id === endpoint.address?.node);
              const subject = state.subjects.find((entry) => entry.id === endpoint.address?.node);
              return (
                <Text key={edge.node.key.node} size="sm" tone="muted">
                  {edge.label}: {claim ? words(claim) : (subject?.title ?? 'Retained source')}
                </Text>
              );
            })}
            <Link href="#/questions/">
              Explore in Questions <Icon name="arrow-up-right" size="sm" />
            </Link>
          </Surface>
        ))
      ) : (
        <Text tone="muted">No open questions are recorded on this topic.</Text>
      )}
    </Stack>
  );
  return (
    <FeaturePage
      title="Graph"
      description="Understand a topic. Follow each statement back to its source."
    >
      <Stack gap="lg" inset="page" block="sm">
        {!!state.loading && <Loader>Opening the topic…</Loader>}
        <Text size="sm" tone="muted">
          SAMPLE VAULT · {topics.length} topics · {vaultStatements.length} statements ·{' '}
          {vaultSources.size} cited sources · {vaultQuestions.length} questions
        </Text>
        <Row wrap={true} justify="between">
          <Text weight="medium">{topic?.title ?? 'Choose a topic'}</Text>
          <Button variant="outline" onClick={() => setBrowse(!browse)}>
            {browse ? 'Close topic browser' : `Browse ${topics.length} topics`}
          </Button>
        </Row>
        {!!browse && (
          <Stack gap="sm">
            <PageControls
              search={{
                label: 'Find a topic',
                placeholder: 'Find a topic…',
                value: query,
                onValueChange: setQuery,
              }}
            />
            <Stack gap="xs">
              {topics
                .filter((entry) =>
                  entry.title.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
                )
                .map((entry) => (
                  <SelectionRow
                    key={entry.id}
                    selected={entry.id === topic?.id}
                    onSelect={() => selectTopic(entry.id)}
                  >
                    <Stack gap="xs">
                      <Text weight="medium">{entry.title}</Text>
                      <Text size="sm" tone="muted">
                        {
                          flatten(entry.blocks).filter((block) => block.data.kind === 'paragraph')
                            .length
                        }{' '}
                        statements ·{' '}
                        {entry.metadata.map((term) => term.label).join(', ') || 'Topic'}
                      </Text>
                    </Stack>
                  </SelectionRow>
                ))}
            </Stack>
            {!topics.some((entry) =>
              entry.title.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
            ) && <Text>No topics match this search.</Text>}
          </Stack>
        )}
        {topic ? (
          <>
            <Stack gap="sm">
              <Text size="sm" tone="muted">
                TOPIC /{' '}
                {design === 'briefing'
                  ? 'BRIEFING'
                  : design === 'trail'
                    ? 'EVIDENCE TRAIL'
                    : 'SOURCE REVIEW'}
              </Text>
              <Heading level={2} size="title">
                {topic.title}
              </Heading>
              <Text>{topic.summary}</Text>
              <Link href={`#/wiki/${encodeURIComponent(topic.id)}/`}>
                Read the Wiki page <Icon name="arrow-up-right" size="sm" />
              </Link>
            </Stack>
            <Surface variant="subtle">
              <Text weight="medium">
                {cited.length} of {statements.length} statements have selected supporting passages.
              </Text>
              <Text size="sm" tone="muted">
                {changed.length
                  ? `${changed.length} cited or referenced source${changed.length === 1 ? ' has' : 's have'} changed or been removed. `
                  : ''}
                {statements.length - cited.length} statements have no statement citation.
              </Text>
            </Surface>
            {design === 'briefing' ? (
              <Stack gap="xl">
                <Stack gap="lg">
                  <Heading level={2}>What you know, and why</Heading>
                  <Text tone="muted">
                    Read the recorded statements alongside the passages used to support them.
                  </Text>
                  {statements.slice(0, visibleCount).map((block, index) => (
                    <Card key={block.id}>
                      <CardContent>
                        <Stack gap="lg">
                          <Text size="sm" tone="muted">
                            STATEMENT {index + 1}
                          </Text>
                          <Heading level={3}>{words(block)}</Heading>
                          <Separator />
                          {evidence(block)}
                        </Stack>
                      </CardContent>
                    </Card>
                  ))}
                </Stack>
                {openQuestions}
              </Stack>
            ) : design === 'trail' ? (
              <Stack gap="xl">
                <Heading level={2}>Follow the evidence</Heading>
                <Text tone="muted">
                  Choose a statement to see its path from topic to retained source passage.
                </Text>
                <Columns>
                  <Stack gap="sm">{statements.slice(0, visibleCount).map(statement)}</Stack>
                  {selected ? (
                    <Surface variant="subtle">
                      <Timeline>
                        <TimelineItem time="Topic">
                          <Heading level={3}>{topic.title}</Heading>
                        </TimelineItem>
                        <TimelineItem time="Says">
                          <Text weight="medium">{words(selected)}</Text>
                        </TimelineItem>
                        <TimelineItem time="Cites" last={true}>
                          {evidence(selected)}
                        </TimelineItem>
                      </Timeline>
                    </Surface>
                  ) : (
                    <Text>No statements recorded.</Text>
                  )}
                </Columns>
                {openQuestions}
              </Stack>
            ) : (
              <Stack gap="xl">
                <Heading level={2}>Where the evidence needs attention</Heading>
                <Text tone="muted">
                  Review source changes and statements without citations before relying on this
                  topic.
                </Text>
                <PageControls
                  filters={{
                    label: 'Evidence coverage',
                    value: filter,
                    active: filter !== 'all',
                    onValueChange: (value) => {
                      setFilter(value);
                      setVisibleCount(6);
                    },
                    options: [
                      { value: 'all', label: 'All statements' },
                      { value: 'uncited', label: 'Without citations' },
                      { value: 'cited', label: 'With citations' },
                    ],
                  }}
                />
                {matching.slice(0, visibleCount).map((block, index) => (
                  <Card key={block.id}>
                    <CardContent>
                      <Stack gap="lg">
                        <Text size="sm" tone="muted">
                          {block.evidence.length ? 'CITED STATEMENT' : 'EVIDENCE GAP'} {index + 1}
                        </Text>
                        <Heading level={3}>{words(block)}</Heading>
                        {evidence(block)}
                      </Stack>
                    </CardContent>
                  </Card>
                ))}
                {!matching.length && <Text>No statements match this filter.</Text>}
                {openQuestions}
              </Stack>
            )}
            {(design === 'review' ? matching.length : statements.length) > visibleCount && (
              <Button variant="outline" onClick={() => setVisibleCount(visibleCount + 6)}>
                Show more statements (
                {(design === 'review' ? matching.length : statements.length) - visibleCount}{' '}
                remaining)
              </Button>
            )}
            {related.length > 0 && (
              <Stack gap="sm">
                <Heading level={2}>Connected topics · {related.length}</Heading>
                <Text size="sm" tone="muted">
                  Recorded topic relationships. Shared citations are shown with their source
                  passages.
                </Text>
                <Row wrap={true}>
                  {related.map((entry) => (
                    <Button key={entry.id} variant="outline" onClick={() => selectTopic(entry.id)}>
                      {entry.title}
                    </Button>
                  ))}
                </Row>
              </Stack>
            )}
            <Separator />
            <Stack gap="lg">
              <Heading level={2}>Topic references</Heading>
              <Text tone="muted">
                {topic.sources.length} sources are attached to the topic as a whole. These are
                background references; the selected passages above establish which statements have
                citations.
              </Text>
              {topic.sources.map((reference) => (
                <Row key={reference.id} justify="between">
                  <Text>{reference.title}</Text>
                  <Badge variant="secondary">{sourceState(reference)}</Badge>
                </Row>
              ))}
              {!topic.sources.length && (
                <Text size="sm" tone="muted">
                  No topic references recorded.
                </Text>
              )}
            </Stack>
          </>
        ) : (
          <Text>No topics are available.</Text>
        )}
      </Stack>
    </FeaturePage>
  );
}
