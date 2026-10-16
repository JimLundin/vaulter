// Throwaway comparison of investigation mechanics, using resolved Wiki evidence.
import { useState, type ComponentProps } from 'react';
import type { OpenApplication } from '../application/index.tsx';
import {
  Badge,
  Button,
  Columns,
  FeaturePage,
  Heading,
  Link,
  Loader,
  NetworkDiagram,
  PageControls,
  Row,
  SelectionRow,
  Separator,
  Stack,
  Surface,
  Text,
} from '../ui/kit/index.ts';
export const graphDesigns = [
  { id: 'inquiry', label: 'A · Inquiry canvas' },
  { id: 'local', label: 'B · Local explorer' },
  { id: 'linked', label: 'C · Linked reading' },
] as const;
type Props = Parameters<NonNullable<ComponentProps<typeof OpenApplication>['renderGraph']>>[0];
type Block = Props['topics'][number]['blocks'][number];
type Reference = Block['evidence'][number];
interface Record {
  id: string;
  label: string;
  detail: string;
  column: number;
  block?: Block;
  reference?: Reference;
}
interface Edge {
  id: string;
  source: string;
  target: string;
  label: string;
}
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
  const [browse, setBrowse] = useState(false);
  const [chosen, setChosen] = useState<string>();
  const [root, setRoot] = useState<string>();
  const [count, setCount] = useState(3);
  const [hidden, setHidden] = useState<string[]>([]);
  const [pinned, setPinned] = useState<string[]>([]);
  const [history, setHistory] = useState<string[]>([]);
  const [lens, setLens] = useState('all');
  const topic =
    topics.find((entry) => entry.id === node) ??
    topics.find((entry) => entry.id === 'preview:graph-topic') ??
    topics[0];
  const all = flatten(topic?.blocks ?? []);
  const statements = all.filter((block) => block.data.kind === 'paragraph' && words(block).trim());
  const questions = all.filter((block) => block.data.kind === 'question');
  const vault = topics.flatMap((entry) => flatten(entry.blocks));
  const records: Record[] = [];
  const edges: Edge[] = [];
  if (topic) records.push({ id: topic.id, label: topic.title, detail: 'TOPIC', column: 0 });
  for (const block of statements) {
    records.push({
      id: block.id,
      label: words(block),
      detail: block.evidence.length ? 'STATEMENT' : 'STATEMENT · UNCITED',
      column: 1,
      block,
    });
    edges.push({
      id: `contains:${block.id}`,
      source: topic!.id,
      target: block.id,
      label: 'contains',
    });
    for (const reference of block.evidence) {
      const id = JSON.stringify(reference.source);
      if (!records.some((record) => record.id === id))
        records.push({
          id,
          label: reference.title,
          detail: `SOURCE · ${sourceState(reference)}`,
          column: 2,
          reference,
        });
      edges.push({ id: reference.id, source: block.id, target: id, label: 'cites passage' });
    }
  }
  for (const question of questions) {
    records.push({
      id: question.id,
      label: words(question),
      detail: 'OPEN QUESTION',
      column: 0,
      block: question,
    });
    for (const edge of state.graph?.relationships({ node: question.id }) ?? []) {
      const endpoint = edge.direction === 'outgoing' ? edge.target : edge.source;
      const target = records.find(
        (record) =>
          record.id === endpoint.address?.node ||
          record.reference?.source.node === endpoint.address?.node,
      );
      if (target)
        edges.push({
          id: edge.node.key.node,
          source: edge.direction === 'outgoing' ? question.id : target.id,
          target: edge.direction === 'outgoing' ? target.id : question.id,
          label: edge.label,
        });
    }
  }
  const selected =
    records.find((record) => record.id === chosen) ??
    records.find((record) => record.block?.data.kind === 'paragraph') ??
    records[0];
  const focus =
    records.find((record) => record.id === root) ??
    records.find(
      (record) =>
        record.block?.data.kind === 'question' &&
        edges.some((edge) => edge.source === record.id || edge.target === record.id),
    ) ??
    records[0];
  const matching = statements.filter(
    (block) =>
      lens === 'all' ||
      (lens === 'uncited'
        ? !block.evidence.length
        : block.evidence.some((ref) => ref.state !== 'original')),
  );
  const branches = matching.filter(
    (block, index) => (index < count || pinned.includes(block.id)) && !hidden.includes(block.id),
  );
  const branchIds = new Set(branches.map((block) => block.id));
  const branchEdges = edges.filter(
    (edge) => branchIds.has(edge.source) || branchIds.has(edge.target),
  );
  const visibleIds = new Set(branchEdges.flatMap((edge) => [edge.source, edge.target]));
  const localEdges = edges
    .filter((edge) => edge.source === focus?.id || edge.target === focus?.id)
    .slice(0, count + 3);
  const localIds = new Set([
    focus?.id,
    ...localEdges.flatMap((edge) => [edge.source, edge.target]),
  ]);
  const shownEdges = design === 'local' ? localEdges : branchEdges;
  const shown = records.filter((record) =>
    design === 'local' ? localIds.has(record.id) : visibleIds.has(record.id),
  );
  const navigateTopic = (id: string) => {
    setChosen(undefined);
    setRoot(undefined);
    setCount(3);
    setHidden([]);
    setPinned([]);
    setHistory([]);
    setBrowse(false);
    setQuery('');
    setLens('all');
    onSelectSubject(id);
  };
  const select = (id: string) => setChosen(id);
  const center = (id: string) => {
    if (focus) setHistory([...history, focus.id]);
    setRoot(id);
    setChosen(id);
  };
  const reset = () => {
    setCount(3);
    setHidden([]);
    setPinned([]);
    setChosen(undefined);
    setRoot(undefined);
    setHistory([]);
    setLens('all');
  };
  const sourceText = (reference: Reference) => (
    <Stack gap="sm" key={reference.id}>
      <Row wrap={true} justify="between">
        <Heading level={3}>{reference.title}</Heading>
        <Badge variant="secondary">{sourceState(reference)}</Badge>
      </Row>
      <Text size="sm" tone="muted">
        REVIEWED PASSAGE
      </Text>
      <Text>“{reference.text}”</Text>
      {reference.state === 'newer' && (
        <Surface variant="subtle">
          <Text size="sm" weight="medium">
            SOURCE NOW SAYS
          </Text>
          <Text>{currentSourceText(reference.source.node) ?? 'Current text is unavailable.'}</Text>
        </Surface>
      )}
      <Text size="sm" tone="muted">
        {reference.state === 'deleted'
          ? 'The source was removed; its reviewed passage remains in history.'
          : reference.state === 'newer'
            ? 'A later source version exists. The citation retains the reviewed passage.'
            : 'This is the passage selected when the statement was cited.'}
      </Text>
      {!!reference.href && <Link href={reference.href}>Open source</Link>}
      <Text size="sm" tone="muted">
        Other topics citing this source
      </Text>
      {topics
        .filter(
          (entry) =>
            entry.id !== topic?.id &&
            flatten(entry.blocks).some((block) =>
              block.evidence.some((ref) => ref.source.node === reference.source.node),
            ),
        )
        .map((entry) => (
          <Button key={entry.id} variant="ghost" onClick={() => navigateTopic(entry.id)}>
            {entry.title}
          </Button>
        ))}
    </Stack>
  );
  const inspector = (
    <Surface variant="subtle">
      <Stack gap="lg">
        <Heading level={2}>Record inspector</Heading>
        {!!selected && (
          <>
            <Badge variant="secondary">{selected.detail}</Badge>
            <Text weight="medium">{selected.label}</Text>
            {selected.block?.data.kind === 'paragraph' && (
              <>
                {design !== 'local' && (
                  <Row wrap={true}>
                    <Button
                      variant="outline"
                      onClick={() =>
                        setPinned(
                          pinned.includes(selected.id)
                            ? pinned.filter((id) => id !== selected.id)
                            : [...pinned, selected.id],
                        )
                      }
                    >
                      {pinned.includes(selected.id) ? 'Unpin branch' : 'Pin branch'}
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => {
                        setHidden([...hidden, selected.id]);
                        setChosen(undefined);
                      }}
                    >
                      Hide branch
                    </Button>
                  </Row>
                )}
                {selected.block.evidence.length ? (
                  selected.block.evidence.map(sourceText)
                ) : (
                  <Text>
                    No statement citation. Topic references do not establish support for this
                    statement.
                  </Text>
                )}
              </>
            )}
            {selected.block?.data.kind === 'question' && (
              <>
                <Text>
                  This question is open. Its recorded context does not count as an Answer.
                </Text>
                <Link href="#/questions/">Explore in Questions</Link>
              </>
            )}
            {!!selected.reference &&
              shownEdges
                .filter((edge) => edge.target === selected.id)
                .map((edge) => {
                  const block = records.find((record) => record.id === edge.source)?.block;
                  return (
                    block && (
                      <Stack gap="sm" key={edge.id}>
                        <SelectionRow selected={false} onSelect={() => select(block.id)}>
                          <Text>{words(block)}</Text>
                        </SelectionRow>
                        {block.evidence
                          .filter((ref) => JSON.stringify(ref.source) === selected.id)
                          .map(sourceText)}
                      </Stack>
                    )
                  );
                })}
            {design === 'local' && (
              <Button variant="outline" onClick={() => center(selected.id)}>
                Center this record
              </Button>
            )}
            <Separator />
            <Heading level={3}>Recorded connections</Heading>
            {edges
              .filter((edge) => edge.source === selected.id || edge.target === selected.id)
              .map((edge) => {
                const other = edge.source === selected.id ? edge.target : edge.source;
                return (
                  <SelectionRow key={edge.id} selected={false} onSelect={() => select(other)}>
                    <Stack gap="xs">
                      <Text size="sm" tone="muted">
                        {edge.source === selected.id ? 'Outgoing' : 'Incoming'} · {edge.label}
                      </Text>
                      <Text>{records.find((record) => record.id === other)?.label}</Text>
                    </Stack>
                  </SelectionRow>
                );
              })}
          </>
        )}
      </Stack>
    </Surface>
  );
  const diagram = (
    <NetworkDiagram
      label={
        design === 'local'
          ? 'Focused record neighborhood'
          : 'Question, statement and source investigation'
      }
      nodes={shown.map((record) => ({
        ...record,
        selected: design === 'local' ? record.id === focus?.id : record.id === selected?.id,
      }))}
      edges={shownEdges}
      layout={design === 'local' ? 'radial' : 'lanes'}
      onSelect={select}
    />
  );
  const statementList = (
    <Stack gap="sm">
      {branches.map((block) => (
        <SelectionRow
          key={block.id}
          selected={
            block.id === selected?.id ||
            (selected?.reference !== undefined &&
              block.evidence.some((ref) => JSON.stringify(ref.source) === selected.id))
          }
          onSelect={() => select(block.id)}
          appearance="card"
        >
          <Stack gap="xs">
            <Text size="sm" tone="muted">
              STATEMENT {statements.indexOf(block) + 1}
              {pinned.includes(block.id) ? ' · PINNED' : ''}
            </Text>
            <Text>{words(block)}</Text>
            <Text size="sm" tone="muted">
              {block.evidence.length} supporting passages
            </Text>
          </Stack>
        </SelectionRow>
      ))}
    </Stack>
  );
  return (
    <FeaturePage
      title="Graph"
      width="wide"
      description="Build an investigation. Keep the evidence in view."
    >
      <Stack gap="lg" inset="page" block="sm">
        {!!state.loading && <Loader>Opening the sample Vault…</Loader>}
        <Text size="sm" tone="muted">
          SAMPLE VAULT · {topics.length} topics ·{' '}
          {vault.filter((block) => block.data.kind === 'paragraph').length} statements ·{' '}
          {new Set(vault.flatMap((block) => block.evidence.map((ref) => ref.source.node))).size}{' '}
          cited sources · {vault.filter((block) => block.data.kind === 'question').length} questions
        </Text>
        <Row wrap={true} justify="between">
          <Heading level={2}>{topic?.title ?? 'Choose a topic'}</Heading>
          <Button variant="outline" onClick={() => setBrowse(!browse)}>
            {browse ? 'Close topic browser' : `Browse ${topics.length} topics`}
          </Button>
        </Row>
        {!!browse && (
          <Stack gap="sm">
            <PageControls
              search={{
                label: 'Find a topic',
                value: query,
                onValueChange: setQuery,
                placeholder: 'Search the sample Vault…',
              }}
            />
            {topics
              .filter((entry) => entry.title.toLowerCase().includes(query.toLowerCase()))
              .map((entry) => (
                <SelectionRow
                  key={entry.id}
                  selected={entry.id === topic?.id}
                  onSelect={() => navigateTopic(entry.id)}
                >
                  <Text>{entry.title}</Text>
                </SelectionRow>
              ))}
          </Stack>
        )}
        <Text tone="muted">
          {design === 'inquiry'
            ? 'Inspired by Discourse Graphs and Bloom: keep several evidence paths on a working canvas.'
            : design === 'local'
              ? 'Inspired by Obsidian and TheBrain: inspect one neighborhood, then choose where to go next.'
              : 'Inspired by Graphologue: the diagram and readable statements share a selection.'}
        </Text>
        <Row wrap={true}>
          <Button variant="outline" onClick={() => setCount(count + 3)}>
            Show more statements ({Math.max(0, matching.length - count)} remaining)
          </Button>
          <Button variant="ghost" onClick={reset}>
            Reset investigation
          </Button>
          {hidden.length > 0 && (
            <Button variant="ghost" onClick={() => setHidden(hidden.slice(0, -1))}>
              Undo hide
            </Button>
          )}
          {design === 'local' && history.length > 0 && (
            <Button
              variant="outline"
              onClick={() => {
                const previous = history.at(-1)!;
                setRoot(previous);
                setChosen(previous);
                setHistory(history.slice(0, -1));
              }}
            >
              Back to previous focus
            </Button>
          )}
        </Row>
        {design !== 'local' && (
          <PageControls
            filters={{
              label: 'Investigation lens',
              value: lens,
              active: lens !== 'all',
              onValueChange: (value) => {
                setLens(value);
                setCount(3);
              },
              options: [
                { value: 'all', label: 'All statements' },
                { value: 'changed', label: 'Changed or removed sources' },
                { value: 'uncited', label: 'Without citations' },
              ],
            }}
          />
        )}
        <Text size="sm" tone="muted">
          {shown.length} visible records · {shownEdges.length} visible connections ·{' '}
          {design === 'local'
            ? `${Math.max(0, edges.filter((edge) => edge.source === focus?.id || edge.target === focus?.id).length - localEdges.length)} more immediate connections`
            : `${statements.length - branches.length} statements outside the canvas`}{' '}
          · {pinned.length} pinned branches
        </Text>
        {design === 'inquiry' ? (
          <Stack gap="lg">
            {diagram}
            <Columns>
              <Stack gap="lg">
                <Heading level={2}>Add a branch</Heading>
                {matching
                  .filter((block) => !branchIds.has(block.id))
                  .map((block) => (
                    <SelectionRow
                      key={block.id}
                      selected={false}
                      onSelect={() => {
                        setPinned([...pinned, block.id]);
                        setHidden(hidden.filter((id) => id !== block.id));
                        setChosen(block.id);
                      }}
                    >
                      <Text>{words(block)}</Text>
                    </SelectionRow>
                  ))}
              </Stack>
              {inspector}
            </Columns>
          </Stack>
        ) : design === 'local' ? (
          <Columns>
            <Stack gap="lg">
              <Heading level={2}>{focus?.label}</Heading>
              {diagram}
              <Heading level={3}>Start from a question</Heading>
              {questions.map((question) => (
                <Button key={question.id} variant="outline" onClick={() => center(question.id)}>
                  {words(question)}
                </Button>
              ))}
              <Heading level={3}>Jump to a statement</Heading>
              {statementList}
            </Stack>
            {inspector}
          </Columns>
        ) : (
          <Stack gap="lg">
            <Columns>
              <Stack gap="lg">
                <Heading level={2}>Read and select</Heading>
                {statementList}
              </Stack>
              {diagram}
            </Columns>
            {inspector}
          </Stack>
        )}
        {!branches.length && design !== 'local' && (
          <Text>
            No visible statements match this lens. Reset the investigation or choose another lens.
          </Text>
        )}
        <Separator />
        <Row wrap={true}>
          <Link href={`#/wiki/${encodeURIComponent(topic?.id ?? '')}/`}>Read the Wiki page</Link>
          <Link href="https://discoursegraphs.com/docs/obsidian/core-features/canvas">
            Discourse Graphs
          </Link>
          <Link href="https://neo4j.com/docs/bloom-user-guide/current/bloom-visual-tour/bloom-scene-interactions/">
            Bloom
          </Link>
          <Link href="https://arxiv.org/html/2305.11473v2">Graphologue</Link>
        </Row>
        <Text size="sm" tone="muted">
          Pinning, hiding and expanding change this working view only. Topic references are
          background provenance, separate from statement citations.
        </Text>
      </Stack>
    </FeaturePage>
  );
}
