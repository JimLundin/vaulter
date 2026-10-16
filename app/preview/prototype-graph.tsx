// Throwaway question: how should a global Vault map narrow into local neighborhoods on phone and desktop?
import { useState, type ComponentProps } from 'react';
import type { OpenApplication } from '../application/index.tsx';
import {
  Badge,
  Button,
  ReadingColumn,
  SupportingPane,
  SplitView,
  Toolbar,
  Select,
  SettingField,
  Heading,
  Link,
  NetworkDiagram,
  Icon,
  PageControls,
  Row,
  SelectionRow,
  Separator,
  Stack,
  Text,
} from '../ui/kit/index.ts';
export const graphDesigns = [
  { id: 'obsidian', label: 'A · Obsidian baseline' },
  { id: 'spotlight', label: 'B · Local spotlight' },
  { id: 'navigator', label: 'C · Map + index' },
] as const;
type Props = Parameters<NonNullable<ComponentProps<typeof OpenApplication>['renderGraph']>>[0];
type Block = Props['topics'][number]['blocks'][number];
type Reference = Block['evidence'][number];
type Population = 'topic' | 'statement' | 'source' | 'question';
interface GraphRecord {
  id: string;
  label: string;
  tone: Population;
  group: string;
  connections?: number;
  block?: Block;
  reference?: Reference;
  topic?: string;
}
interface Edge {
  id: string;
  source: string;
  target: string;
  label: string;
}
const flatten = (blocks: Block[]): Block[] =>
  blocks.flatMap((block) => [block, ...flatten(block.children)]);
const words = (block: Block): string =>
  typeof block.data.text === 'string' ? block.data.text : block.children.map(words).join('');
const populations: Population[] = ['topic', 'statement', 'source', 'question'];
const names = {
  topic: 'Topics',
  statement: 'Statements',
  source: 'Sources',
  question: 'Questions',
};

export function GraphPrototype({
  topics,
  state,
  currentSourceText,
  design,
}: Props & { design: string }) {
  const [enabled, setEnabled] = useState<Population[]>(populations);
  const [query, setQuery] = useState('');
  const [chosen, setChosen] = useState<string>();
  const [focus, setFocus] = useState<string>();
  const [depth, setDepth] = useState(1);
  const [inspecting, setInspecting] = useState(false);
  const [paneOpen, setPaneOpen] = useState(false);
  const [colorMode, setColorMode] = useState('area');
  const [history, setHistory] = useState<Array<{ focus?: string; depth: number }>>([]);
  const records: GraphRecord[] = [];
  const edges: Edge[] = [];
  for (const topic of topics) {
    const group =
      topic.metadata.find((term) =>
        ['Studio', 'Garden', 'Learning', 'Routine'].includes(term.label),
      )?.label ??
      (topic.title.includes('studio') || topic.title.includes('Studio')
        ? 'Studio'
        : topic.title.includes('morning')
          ? 'Routine'
          : topic.title.toLowerCase().includes('reading')
            ? 'Learning'
            : 'Garden');
    records.push({ id: topic.id, label: topic.title, tone: 'topic', group, topic: topic.id });
    for (const block of flatten(topic.blocks)) {
      if (block.data.kind !== 'paragraph' && block.data.kind !== 'question') continue;
      records.push({
        id: block.id,
        label: words(block),
        tone: block.data.kind === 'question' ? 'question' : 'statement',
        group,
        block,
        topic: topic.id,
      });
      edges.push({
        id: `contains:${block.id}`,
        source: topic.id,
        target: block.id,
        label: 'contains',
      });
      for (const reference of block.evidence) {
        const id = reference.source.node;
        if (!records.some((record) => record.id === id))
          records.push({ id, label: reference.title, tone: 'source', group, reference });
        const shared = records.find((record) => record.id === id)!;
        if (shared.group !== group) shared.group = 'Shared';
        edges.push({ id: reference.id, source: block.id, target: id, label: 'cites passage' });
      }
    }
  }
  for (const record of records.filter(
    (record) => record.tone === 'question' || record.tone === 'topic',
  )) {
    for (const edge of state.graph?.relationships({ node: record.id }) ?? []) {
      const source = edge.source.address?.node;
      const target = edge.target.address?.node;
      if (
        source &&
        target &&
        records.some((record) => record.id === source) &&
        records.some((record) => record.id === target) &&
        !edges.some((existing) => existing.id === edge.node.key.node)
      )
        edges.push({ id: edge.node.key.node, source, target, label: edge.label });
    }
  }
  for (const record of records)
    record.connections = edges.filter(
      (edge) => edge.source === record.id || edge.target === record.id,
    ).length;
  const selected = records.find((record) => record.id === chosen);
  const focused = records.find((record) => record.id === focus);
  const adjacent = new Set(focus ? [focus] : []);
  if (focus)
    for (let level = 0; level < depth; level++) {
      const previous = new Set(adjacent);
      for (const edge of edges) {
        if (previous.has(edge.source)) adjacent.add(edge.target);
        if (previous.has(edge.target)) adjacent.add(edge.source);
      }
    }
  const matching = records.filter(
    (record) =>
      (enabled.includes(record.tone) || record.id === focus) &&
      (!focus || adjacent.has(record.id)) &&
      (record.id === focus || record.label.toLowerCase().includes(query.toLowerCase())),
  );
  const visible = focus
    ? [
        ...matching.filter((record) => record.id === focus),
        ...matching.filter((record) => record.id !== focus),
      ].slice(0, 36)
    : matching;
  const ids = new Set(visible.map((record) => record.id));
  const visibleEdges = edges.filter((edge) => ids.has(edge.source) && ids.has(edge.target));
  const index = records.filter(
    (record) =>
      enabled.includes(record.tone) && record.label.toLowerCase().includes(query.toLowerCase()),
  );
  const inspect = (id: string) => {
    setChosen(id);
    setInspecting(true);
    setPaneOpen(true);
  };
  const pushView = () => setHistory([...history, { focus, depth }]);
  const focusRecord = (id: string) => {
    pushView();
    setFocus(id);
    setDepth(1);
    setChosen(id);
    setQuery('');
    setInspecting(false);
    setPaneOpen(false);
  };
  const global = () => {
    setFocus(undefined);
    setDepth(1);
    setInspecting(false);
    setPaneOpen(false);
    setHistory([]);
  };
  const back = () => {
    const previous = history.at(-1);
    if (previous) {
      setFocus(previous.focus);
      setDepth(previous.depth);
      setHistory(history.slice(0, -1));
      setInspecting(false);
      setPaneOpen(false);
    }
  };
  const spotlight = design === 'spotlight' && !!focus;
  const mapRecords = spotlight
    ? records.filter((record) => enabled.includes(record.tone) || record.id === focus)
    : visible;
  const mapIds = new Set(mapRecords.map((record) => record.id));
  const mapEdges = spotlight
    ? edges.filter((edge) => mapIds.has(edge.source) && mapIds.has(edge.target))
    : visibleEdges;
  const areaColors: Record<string, string> = {
    Studio: '#8b83ec',
    Garden: '#39ad93',
    Learning: '#58a7e2',
    Routine: '#de9b44',
    Shared: '#da79ab',
  };
  const typeColors = {
    topic: '#7c83e8',
    statement: '#8a8f9b',
    source: '#39ad93',
    question: '#de9b44',
  };
  const connectionColors = {
    '0–2 connections': '#8a8f9b',
    '3–7 connections': '#58a7e2',
    '8+ connections': '#de9b44',
  };
  const connectionBand = (record: GraphRecord) =>
    (record.connections ?? 0) < 3
      ? '0–2 connections'
      : (record.connections ?? 0) < 8
        ? '3–7 connections'
        : '8+ connections';
  const legend = Object.entries(
    colorMode === 'area' ? areaColors : colorMode === 'type' ? typeColors : connectionColors,
  ).map(([label, color]) => ({ label, color }));
  const graph = (
    <NetworkDiagram
      label={focus ? 'Local Vault graph' : 'Global Vault graph'}
      layout="map"
      fill={true}
      legend={legend}
      viewKey={design === 'spotlight' ? 'global' : (focus ?? 'global')}
      nodes={mapRecords.map((record) => ({
        ...record,
        color:
          colorMode === 'area'
            ? areaColors[record.group]
            : colorMode === 'type'
              ? typeColors[record.tone]
              : connectionColors[connectionBand(record)],
        selected: record.id === (focus ?? chosen),
        muted: spotlight && !ids.has(record.id),
      }))}
      edges={mapEdges}
      onSelect={inspect}
    />
  );
  const filters = (
    <Row wrap={true}>
      {populations.map((population) => (
        <Button
          key={population}
          variant={enabled.includes(population) ? 'filled' : 'outline'}
          aria-pressed={enabled.includes(population)}
          onClick={() =>
            setEnabled(
              enabled.includes(population)
                ? enabled.filter((value) => value !== population)
                : [...enabled, population],
            )
          }
        >
          {names[population]} · {records.filter((record) => record.tone === population).length}
        </Button>
      ))}
    </Row>
  );
  const recordIndex = (
    <Stack gap="sm">
      <PageControls
        placement="expanded"
        search={{
          label: 'Find a graph record',
          placeholder: 'Find a topic, question or source…',
          value: query,
          onValueChange: setQuery,
        }}
      />
      <Text size="sm" tone="muted">
        {index.length} matching records{index.length > 12 ? ' · first 12 shown' : ''}
      </Text>
      {index.slice(0, 12).map((record) => (
        <SelectionRow
          key={record.id}
          selected={record.id === chosen}
          onSelect={() => inspect(record.id)}
        >
          <Stack gap="xs">
            <Text size="sm" tone="muted">
              {names[record.tone]} · {record.group}
            </Text>
            <Text>{record.label}</Text>
          </Stack>
        </SelectionRow>
      ))}
    </Stack>
  );
  const source = (reference: Reference) => (
    <Stack gap="sm" key={reference.id}>
      <Heading level={3}>{reference.title}</Heading>
      <Badge variant="secondary">
        {reference.state === 'newer'
          ? 'Source changed'
          : reference.state === 'deleted'
            ? 'Source removed'
            : 'Recorded passage'}
      </Badge>
      <Text>“{reference.text}”</Text>
      {reference.state === 'newer' && (
        <>
          <Text size="sm" weight="medium">
            SOURCE NOW SAYS
          </Text>
          <Text>
            {currentSourceText(reference.source.node) ?? 'Current source text is unavailable.'}
          </Text>
        </>
      )}
      {reference.state === 'deleted' && (
        <Text size="sm" tone="muted">
          The reviewed passage is retained after removal of its source.
        </Text>
      )}
      {!!reference.href && <Link href={reference.href}>Open source</Link>}
    </Stack>
  );
  const relations = selected
    ? edges.filter((edge) => edge.source === selected.id || edge.target === selected.id)
    : [];
  return (
    <SplitView
      main={
        <ReadingColumn label="Graph workspace">
          <Toolbar
            label="Graph"
            actions={
              <Row gap="xs">
                <Button
                  variant="outline"
                  iconOnly={true}
                  aria-label="Graph options"
                  title="Graph options"
                  onClick={() => {
                    setInspecting(false);
                    setPaneOpen(true);
                  }}
                >
                  <Icon name="settings" />
                </Button>
              </Row>
            }
          >
            <Row>
              <Heading level={1}>Graph</Heading>
            </Row>
          </Toolbar>
          {!!focus && <Text size="sm">Local · {focused?.label}</Text>}
          <PageControls
            placement="rail"
            search={{
              label: 'Find a graph record',
              placeholder: 'Find a topic, question or source…',
              value: query,
              onValueChange: setQuery,
            }}
            filters={{
              type: 'multiple',
              label: 'Visible records',
              value: enabled,
              options: populations.map((population) => ({
                value: population,
                label: names[population],
              })),
              active: enabled.length !== populations.length,
              onValueChange: (values) => setEnabled(values as Population[]),
            }}
          />
          {graph}
        </ReadingColumn>
      }
      supporting={
        <SupportingPane
          title={inspecting ? 'Graph record' : 'Graph options'}
          open={paneOpen}
          persistent={design === 'navigator'}
          selection={inspecting ? chosen : 'options'}
          onClose={() => setPaneOpen(false)}
          actions={
            inspecting ? (
              <Button variant="ghost" size="compact" onClick={() => setInspecting(false)}>
                Options
              </Button>
            ) : undefined
          }
        >
          {inspecting ? (
            <>
              {!!selected && (
                <Stack gap="lg">
                  <Badge variant="secondary">
                    {names[selected.tone]} · {selected.group}
                  </Badge>
                  <Heading level={2}>{selected.label}</Heading>
                  <Button onClick={() => focusRecord(selected.id)}>Focus neighborhood</Button>
                  <Text size="sm" tone="muted">
                    {relations.length} direct connections · population filters remain active
                  </Text>
                  {selected.tone === 'question' && (
                    <Text>
                      This question is open. Context connections do not count as a recorded Answer.
                    </Text>
                  )}
                  {selected.tone === 'topic' && (
                    <Link href={`#/wiki/${encodeURIComponent(selected.id)}/`}>Read Wiki page</Link>
                  )}
                  {selected.tone === 'statement' &&
                    (selected.block?.evidence.length ? (
                      selected.block.evidence.map(source)
                    ) : (
                      <Text>
                        No statement citation. Topic references do not establish support for this
                        statement.
                      </Text>
                    ))}
                  {selected.tone === 'source' &&
                    records
                      .filter((record) =>
                        record.block?.evidence.some(
                          (reference) => reference.source.node === selected.id,
                        ),
                      )
                      .map((record) => (
                        <Stack key={record.id} gap="sm">
                          <SelectionRow selected={false} onSelect={() => setChosen(record.id)}>
                            <Text>{record.label}</Text>
                          </SelectionRow>
                          {record.block?.evidence
                            .filter((reference) => reference.source.node === selected.id)
                            .map(source)}
                        </Stack>
                      ))}
                  <Separator />
                  <Heading level={3}>Direct connections</Heading>
                  {relations.map((edge) => {
                    const other = records.find(
                      (record) =>
                        record.id === (edge.source === selected.id ? edge.target : edge.source),
                    );
                    return other ? (
                      <SelectionRow
                        key={edge.id}
                        selected={false}
                        onSelect={() => setChosen(other.id)}
                      >
                        <Stack gap="xs">
                          <Text size="sm" tone="muted">
                            {edge.source === selected.id ? 'Outgoing' : 'Incoming'} · {edge.label}
                          </Text>
                          <Text>{other.label}</Text>
                        </Stack>
                      </SelectionRow>
                    ) : null;
                  })}
                </Stack>
              )}
            </>
          ) : (
            <Stack gap="lg">
              {!!focus && (
                <Row wrap={true}>
                  <Text size="sm">Local · {focused?.label}</Text>
                  <Button
                    variant={depth === 1 ? 'filled' : 'outline'}
                    size="compact"
                    onClick={() => {
                      setDepth(1);
                      setPaneOpen(false);
                    }}
                  >
                    Immediate neighbors
                  </Button>
                  <Button
                    variant={depth === 2 ? 'filled' : 'outline'}
                    size="compact"
                    onClick={() => {
                      setDepth(2);
                      setPaneOpen(false);
                    }}
                  >
                    Two steps out
                  </Button>
                  {history.length > 0 && (
                    <Button variant="outline" size="compact" onClick={back}>
                      Back one level
                    </Button>
                  )}
                  <Button variant="outline" size="compact" onClick={global}>
                    Return to global map
                  </Button>
                </Row>
              )}
              <SettingField
                label="Color by"
                description="Change what the colors reveal, keeping the same layout."
              >
                <Select
                  aria-label="Color by"
                  value={colorMode}
                  onChange={(event) => setColorMode(event.currentTarget.value)}
                  options={[
                    { value: 'area', label: 'Topic area' },
                    { value: 'type', label: 'Record type' },
                    { value: 'connections', label: 'Connection count' },
                  ]}
                />
              </SettingField>
              <Text size="sm" tone="muted">
                Topic areas follow the sample pages’ metadata. Sources cited across areas are
                Shared.
              </Text>
              <Heading level={2}>Visible records</Heading>
              <PageControls placement="expanded">{filters}</PageControls>
              <Text size="sm" tone="muted">
                {records.length} sample records · {visible.length}{' '}
                {spotlight ? 'highlighted' : 'visible'} · {visibleEdges.length} connections
                {focus
                  ? ' · ' + (matching.length - visible.length) + ' beyond the local view limit'
                  : ''}
              </Text>
              <Separator />
              <Heading level={2}>Find a record</Heading>
              {recordIndex}
              <Text size="sm" tone="muted">
                Connections shape the map. Larger nodes have more incoming and outgoing connections.
              </Text>
            </Stack>
          )}
        </SupportingPane>
      }
    />
  );
}
