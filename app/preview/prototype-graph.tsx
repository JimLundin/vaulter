// Throwaway question: which configurable parent-topic clustering best preserves the preferred Obsidian map?
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
  Checkbox,
  Label,
  Surface,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
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
  { id: 'topic-tight', label: 'A · Topics tight · default' },
  { id: 'topic-balanced', label: 'B · Topics gentle' },
  { id: 'topic-separated', label: 'C · Topics separated' },
  { id: 'obsidian', label: 'D · Obsidian baseline' },
  { id: 'obsidian-dense', label: 'E · Obsidian compact' },
] as const;
type Grouping = 'none' | 'topics';
type Spacing = 'compact' | 'balanced' | 'relaxed';
type EdgeSpacing = 'tight' | 'balanced' | 'roomy';
type TopicSeparation = 'close' | 'balanced' | 'open';
const presets: Record<
  string,
  {
    grouping: Grouping;
    cohesion: string;
    spacing: Spacing;
    edgeSpacing: EdgeSpacing;
    separation?: TopicSeparation;
  }
> = {
  'topic-tight': {
    grouping: 'topics',
    cohesion: 'medium',
    spacing: 'compact',
    edgeSpacing: 'tight',
    separation: 'close',
  },
  'topic-balanced': {
    grouping: 'topics',
    cohesion: 'soft',
    spacing: 'balanced',
    edgeSpacing: 'tight',
    separation: 'close',
  },
  'topic-separated': {
    grouping: 'topics',
    cohesion: 'medium',
    spacing: 'compact',
    edgeSpacing: 'tight',
    separation: 'open',
  },
  obsidian: { grouping: 'none', cohesion: 'soft', spacing: 'balanced', edgeSpacing: 'balanced' },
  'obsidian-dense': {
    grouping: 'none',
    cohesion: 'soft',
    spacing: 'compact',
    edgeSpacing: 'tight',
  },
};
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
  parentTopics: string[];
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
  const [colorMode, setColorMode] = useState('topic');
  const preset = presets[design] ?? presets['topic-tight']!;
  const [grouping, setGrouping] = useState<Grouping>(preset.grouping);
  const [cohesion, setCohesion] = useState(preset.cohesion);
  const [spacing, setSpacing] = useState<Spacing>(preset.spacing);
  const [edgeSpacing, setEdgeSpacing] = useState<EdgeSpacing>(preset.edgeSpacing);
  const [separation, setSeparation] = useState<TopicSeparation>(preset.separation ?? 'balanced');
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
    records.push({
      id: topic.id,
      label: topic.title,
      tone: 'topic',
      group,
      topic: topic.id,
      parentTopics: [topic.id],
    });
    for (const block of flatten(topic.blocks)) {
      if (block.data.kind !== 'paragraph' && block.data.kind !== 'question') continue;
      records.push({
        id: block.id,
        label: words(block),
        tone: block.data.kind === 'question' ? 'question' : 'statement',
        group,
        block,
        topic: topic.id,
        parentTopics: [topic.id],
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
          records.push({
            id,
            label: reference.title,
            tone: 'source',
            group,
            reference,
            parentTopics: [],
          });
        const shared = records.find((record) => record.id === id)!;
        if (!shared.parentTopics.includes(topic.id)) shared.parentTopics.push(topic.id);
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
  const groupingDescription =
    grouping === 'none'
      ? 'Only links and repulsion shape the map. Colors do not pull nodes together.'
      : `${topics.length} parent topics. Statements and questions stay with their topic; shared sources are pulled toward every topic that cites them, making overlaps visible near the borders.`;
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
  const topicColors = new Map(
    topics.map((topic, index) => [topic.id, `hsl(${(index * 137.508) % 360} 55% 55%)`]),
  );
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
  const legend =
    colorMode === 'topic'
      ? [
          ...topics.map((topic) => ({ label: topic.title, color: topicColors.get(topic.id)! })),
          { label: 'Shared sources', color: '#da79ab' },
        ]
      : Object.entries(
          colorMode === 'area' ? areaColors : colorMode === 'type' ? typeColors : connectionColors,
        ).map(([label, color]) => ({ label, color }));
  const graph = (
    <NetworkDiagram
      label={focus ? 'Local Vault graph' : 'Global Vault graph'}
      layout="map"
      fill={true}
      mapOptions={{
        groupAttraction:
          grouping === 'none'
            ? 0
            : cohesion === 'soft'
              ? 0.018
              : cohesion === 'medium'
                ? 0.065
                : 0.22,
        spacing,
        edgeSpacing,
        groupLayout: 'relationships',
        groupSeparation: separation === 'close' ? 0.65 : separation === 'open' ? 1.15 : 0.85,
      }}
      legend={legend}
      actions={
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
      }
      viewKey={design === 'spotlight' ? 'global' : (focus ?? 'global')}
      nodes={mapRecords.map((record) => ({
        ...record,
        group: record.topic,
        groups: record.parentTopics,
        color:
          colorMode === 'topic'
            ? record.parentTopics.length > 1
              ? '#da79ab'
              : topicColors.get(record.parentTopics[0]!)
            : colorMode === 'area'
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
    <Stack gap="xs">
      {populations.map((population) => (
        <Row key={population} justify="between" block="sm">
          <Label>
            <Checkbox
              aria-label={names[population]}
              checked={enabled.includes(population)}
              onCheckedChange={(checked) =>
                setEnabled(
                  checked === true
                    ? [...enabled, population]
                    : enabled.filter((value) => value !== population),
                )
              }
            />
            <Text size="sm">{names[population]}</Text>
          </Label>
          <Text size="sm" tone="muted">
            {records.filter((record) => record.tone === population).length}
          </Text>
        </Row>
      ))}
    </Stack>
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
          <Toolbar label="Graph">
            <Row>
              <Heading level={1}>Graph</Heading>
              <Text size="sm" tone="muted">
                {grouping === 'none' ? 'Relationships' : 'Parent topics'} · {spacing} ·{' '}
                {edgeSpacing} edges
              </Text>
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
                  <Text size="sm" tone="muted">
                    {selected.tone === 'source' ? 'Cited from' : 'Grouped under'}{' '}
                    {selected.parentTopics
                      .map((id) => topics.find((topic) => topic.id === id)?.title ?? id)
                      .join(' · ')}
                  </Text>
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
            <Tabs defaultValue="settings">
              <TabsList aria-label="Graph options">
                <TabsTrigger value="settings">Settings</TabsTrigger>
                <TabsTrigger value="records">Records</TabsTrigger>
              </TabsList>
              <TabsContent value="settings">
                <Stack gap="xl" block="sm">
                  {!!focus && (
                    <Stack gap="sm" as="section" aria-label="Local view">
                      <Heading level={2}>Local view</Heading>
                      <Text size="sm" tone="muted">
                        {focused?.label}
                      </Text>
                      <Row wrap={true}>
                        <Button
                          size="compact"
                          variant={depth === 1 ? 'filled' : 'outline'}
                          onClick={() => {
                            setDepth(1);
                            setPaneOpen(false);
                          }}
                        >
                          Immediate neighbors
                        </Button>
                        <Button
                          size="compact"
                          variant={depth === 2 ? 'filled' : 'outline'}
                          onClick={() => {
                            setDepth(2);
                            setPaneOpen(false);
                          }}
                        >
                          Two steps out
                        </Button>
                      </Row>
                      <Row wrap={true}>
                        {history.length > 0 && (
                          <Button size="compact" variant="ghost" onClick={back}>
                            Back one level
                          </Button>
                        )}
                        <Button size="compact" variant="ghost" onClick={global}>
                          Return to global map
                        </Button>
                      </Row>
                      <Separator />
                    </Stack>
                  )}
                  <Surface variant="subtle" as="section" aria-label="Layout">
                    <Stack gap="lg">
                      <Heading level={2}>Layout</Heading>
                      <SettingField label="Group by" description={groupingDescription}>
                        <Select
                          aria-label="Group by"
                          value={grouping}
                          onChange={(event) => setGrouping(event.currentTarget.value as Grouping)}
                          options={[
                            { value: 'topics', label: 'Parent topic' },
                            { value: 'none', label: 'Relationships only' },
                          ]}
                        />
                      </SettingField>
                      {grouping === 'topics' && (
                        <SettingField
                          label="Topic separation"
                          description="Keep topics close to reveal their overlaps, or spread their centers for clearer separation. Relationships still decide which topics sit near each other."
                        >
                          <Select
                            aria-label="Topic separation"
                            value={separation}
                            onChange={(event) =>
                              setSeparation(event.currentTarget.value as TopicSeparation)
                            }
                            options={[
                              { value: 'close', label: 'Close · shared borders' },
                              { value: 'balanced', label: 'Balanced' },
                              { value: 'open', label: 'Open · distinct groups' },
                            ]}
                          />
                        </SettingField>
                      )}
                      {grouping !== 'none' && (
                        <SettingField
                          label="Group cohesion"
                          description="Tighten records around their parent topic. Sources cited across topics stay pulled toward all of them."
                        >
                          <Select
                            aria-label="Group cohesion"
                            value={cohesion}
                            onChange={(event) => setCohesion(event.currentTarget.value)}
                            options={[
                              { value: 'soft', label: 'Gentle' },
                              { value: 'medium', label: 'Tight' },
                              { value: 'strong', label: 'Very tight' },
                            ]}
                          />
                        </SettingField>
                      )}
                      <SettingField
                        label="Within-topic spacing"
                        description="Balances link length and repulsion. Fit still adapts the settled layout to the canvas."
                      >
                        <Select
                          aria-label="Within-topic spacing"
                          value={spacing}
                          onChange={(event) => setSpacing(event.currentTarget.value as Spacing)}
                          options={[
                            { value: 'compact', label: 'Compact' },
                            { value: 'balanced', label: 'Balanced' },
                            { value: 'relaxed', label: 'Relaxed' },
                          ]}
                        />
                      </SettingField>
                      <SettingField
                        label="Canvas edges"
                        description={
                          edgeSpacing === 'tight'
                            ? '24px clearance, plus space for the mobile rail.'
                            : edgeSpacing === 'roomy'
                              ? '14% breathing room on each axis, plus mobile rail clearance.'
                              : 'Adaptive 28–48px clearance, plus space for the mobile rail.'
                        }
                      >
                        <Select
                          aria-label="Canvas edges"
                          value={edgeSpacing}
                          onChange={(event) =>
                            setEdgeSpacing(event.currentTarget.value as EdgeSpacing)
                          }
                          options={[
                            { value: 'tight', label: 'Close to the edge' },
                            { value: 'balanced', label: 'Balanced margin' },
                            { value: 'roomy', label: 'Generous margin' },
                          ]}
                        />
                      </SettingField>
                      <Text size="sm" tone="muted">
                        Layout changes keep dragged nodes pinned. Reset positions to compare the
                        full automatic layout.
                      </Text>
                      <Button
                        variant="outline"
                        onClick={() => {
                          setGrouping('topics');
                          setCohesion('medium');
                          setSpacing('compact');
                          setSeparation('close');
                          setEdgeSpacing('tight');
                        }}
                      >
                        Use default layout
                      </Button>
                    </Stack>
                  </Surface>
                  <Stack gap="sm" as="section" aria-label="Appearance">
                    <Heading level={2}>Appearance</Heading>
                    <SettingField
                      label="Color by"
                      description={
                        colorMode === 'topic'
                          ? 'Each parent topic has its own color. Sources cited by several topics use the shared color.'
                          : colorMode === 'area'
                            ? 'Topic areas, with Shared for sources cited across areas.'
                            : colorMode === 'type'
                              ? 'Topics, statements, sources and questions.'
                              : 'Total connections: 0–2, 3–7, or 8 and above.'
                      }
                    >
                      <Select
                        aria-label="Color by"
                        value={colorMode}
                        onChange={(event) => setColorMode(event.currentTarget.value)}
                        options={[
                          { value: 'topic', label: 'Parent topic' },
                          { value: 'area', label: 'Topic area' },
                          { value: 'type', label: 'Record type' },
                          { value: 'connections', label: 'Connection count' },
                        ]}
                      />
                    </SettingField>
                  </Stack>
                  <PageControls placement="expanded">
                    <Stack gap="sm" as="section" aria-label="Visible records">
                      <Separator />
                      <Heading level={2}>Visible records</Heading>
                      {filters}
                    </Stack>
                  </PageControls>

                  <Row justify="between">
                    <Text size="sm" tone="muted">
                      {visible.length} {spotlight ? 'highlighted' : 'visible'} records
                    </Text>
                    <Text size="sm" tone="muted">
                      {visibleEdges.length} links
                    </Text>
                  </Row>
                  {!!focus && matching.length > visible.length && (
                    <Text size="sm" tone="muted">
                      {matching.length - visible.length} records beyond the local view limit
                    </Text>
                  )}
                </Stack>
              </TabsContent>
              <TabsContent value="records">
                <Stack gap="sm" block="sm">
                  <Heading level={2}>Find a record</Heading>
                  {recordIndex}
                </Stack>
              </TabsContent>
            </Tabs>
          )}
        </SupportingPane>
      }
    />
  );
}
