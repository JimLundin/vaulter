// Throwaway question: which refinements of the preferred Obsidian and connection-community layouts work best?
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
  { id: 'obsidian', label: 'A · Obsidian baseline' },
  { id: 'obsidian-dense', label: 'B · Obsidian compact' },
  { id: 'communities', label: 'C · Connection communities' },
  { id: 'communities-soft', label: 'D · Communities blended' },
  { id: 'communities-broad', label: 'E · Communities broad' },
] as const;
type Grouping = 'none' | 'communities' | 'areas';
type Spacing = 'compact' | 'balanced' | 'relaxed';
type EdgeSpacing = 'tight' | 'balanced' | 'roomy';
type CommunityScale = 'fine' | 'standard' | 'broad';
const presets: Record<
  string,
  {
    grouping: Grouping;
    cohesion: string;
    spacing: Spacing;
    edgeSpacing: EdgeSpacing;
    communityScale?: CommunityScale;
  }
> = {
  obsidian: { grouping: 'none', cohesion: 'soft', spacing: 'balanced', edgeSpacing: 'balanced' },
  'obsidian-dense': {
    grouping: 'none',
    cohesion: 'soft',
    spacing: 'compact',
    edgeSpacing: 'tight',
  },
  communities: {
    grouping: 'communities',
    cohesion: 'medium',
    spacing: 'balanced',
    edgeSpacing: 'tight',
  },
  'communities-soft': {
    grouping: 'communities',
    cohesion: 'soft',
    spacing: 'balanced',
    edgeSpacing: 'tight',
  },
  'communities-broad': {
    grouping: 'communities',
    cohesion: 'soft',
    spacing: 'relaxed',
    edgeSpacing: 'balanced',
    communityScale: 'broad',
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

// Deterministic local modularity optimization on the full fixture. Color and filtering do not
// change membership. These are connection communities, not topic-area categories.
function connectionCommunities(records: GraphRecord[], edges: Edge[], scale: CommunityScale) {
  const resolution = scale === 'broad' ? 0.4 : scale === 'fine' ? 1.6 : 1;
  const neighbors = new Map(records.map((record) => [record.id, new Map<string, number>()]));
  for (const edge of edges) {
    if (edge.source === edge.target) continue;
    for (const [a, b] of [
      [edge.source, edge.target],
      [edge.target, edge.source],
    ]) {
      const row = neighbors.get(a!);
      if (row && neighbors.has(b!)) row.set(b!, (row.get(b!) ?? 0) + 1);
    }
  }
  const degrees = new Map(
    [...neighbors].map(([id, row]) => [id, [...row.values()].reduce((a, b) => a + b, 0)]),
  );
  const total = [...degrees.values()].reduce((a, b) => a + b, 0);
  const membership = new Map(records.map((record) => [record.id, record.id]));
  const weights = new Map(degrees);
  if (!total) return membership;
  for (let pass = 0; pass < 30; pass++) {
    let changed = false;
    for (const record of records) {
      const current = membership.get(record.id)!;
      const degree = degrees.get(record.id)!;
      weights.set(current, weights.get(current)! - degree);
      const linked = new Map<string, number>();
      for (const [neighbor, weight] of neighbors.get(record.id)!) {
        const group = membership.get(neighbor)!;
        linked.set(group, (linked.get(group) ?? 0) + weight);
      }
      const gain = (group: string) =>
        (linked.get(group) ?? 0) - (resolution * degree * (weights.get(group) ?? 0)) / total;
      let best = current;
      for (const group of linked.keys()) if (gain(group) > gain(best) + 0.000_01) best = group;
      membership.set(record.id, best);
      weights.set(best, (weights.get(best) ?? 0) + degree);
      changed ||= best !== current;
    }
    if (!changed) break;
  }
  // At broad scale, also join whole communities. Moving one node at a time can otherwise
  // remain stuck in the same small hub neighborhoods despite a lower resolution.
  if (scale === 'broad') {
    for (let pass = 0; pass < records.length; pass++) {
      const totals = new Map<string, number>();
      for (const [id, group] of membership)
        totals.set(group, (totals.get(group) ?? 0) + degrees.get(id)!);
      const bridges = new Map<string, number>();
      for (const edge of edges) {
        const source = membership.get(edge.source);
        const target = membership.get(edge.target);
        if (!(source && target) || source === target) continue;
        const pair = JSON.stringify([source, target].sort());
        bridges.set(pair, (bridges.get(pair) ?? 0) + 1);
      }
      let best: [string, string] | undefined;
      let bestGain = 0.000_01;
      for (const [pair, weight] of bridges) {
        const [a, b] = JSON.parse(pair) as [string, string];
        const gain = weight - (resolution * totals.get(a)! * totals.get(b)!) / total;
        if (gain > bestGain) {
          best = [a, b];
          bestGain = gain;
        }
      }
      if (!best) break;
      for (const [id, group] of membership) if (group === best[1]) membership.set(id, best[0]);
    }
  }
  return membership;
}

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
  const preset = presets[design] ?? presets.obsidian!;
  const [grouping, setGrouping] = useState<Grouping>(preset.grouping);
  const [cohesion, setCohesion] = useState(preset.cohesion);
  const [spacing, setSpacing] = useState<Spacing>(preset.spacing);
  const [edgeSpacing, setEdgeSpacing] = useState<EdgeSpacing>(preset.edgeSpacing);
  const [communityScale, setCommunityScale] = useState<CommunityScale>(
    preset.communityScale ?? 'standard',
  );
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
  const communities = connectionCommunities(records, edges, communityScale);
  const communityCount = new Set(communities.values()).size;
  const groupingDescription =
    grouping === 'none'
      ? 'Only links and repulsion shape the map. Colors do not pull nodes together.'
      : grouping === 'communities'
        ? `${communityCount} groups detected from densely connected records. Cross-group links stay visible; colors still show your selected meaning.`
        : 'Topic areas gently pull related records toward shared regions. Shared sources occupy their own group; all links remain visible.';
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
        group: grouping === 'communities' ? communities.get(record.id) : record.group,
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
                {grouping === 'none'
                  ? 'Relationships'
                  : grouping === 'communities'
                    ? `${communityScale} communities`
                    : 'Topic groups'}{' '}
                · {spacing} · {edgeSpacing} edges
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
                  <Stack gap="sm" as="section" aria-label="Appearance">
                    <Heading level={2}>Appearance</Heading>
                    <SettingField
                      label="Color by"
                      description={
                        colorMode === 'area'
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
                  <Surface variant="subtle" as="section" aria-label="Layout">
                    <Stack gap="lg">
                      <Heading level={2}>Layout</Heading>
                      <SettingField label="Group by" description={groupingDescription}>
                        <Select
                          aria-label="Group by"
                          value={grouping}
                          onChange={(event) => setGrouping(event.currentTarget.value as Grouping)}
                          options={[
                            { value: 'none', label: 'Relationships only' },
                            { value: 'communities', label: 'Connection communities' },
                            { value: 'areas', label: 'Topic area' },
                          ]}
                        />
                      </SettingField>
                      {grouping === 'communities' && (
                        <SettingField
                          label="Community scale"
                          description="Broad combines nearby connection groups; fine favors smaller groups. Colors keep their selected meaning."
                        >
                          <Select
                            aria-label="Community scale"
                            value={communityScale}
                            onChange={(event) =>
                              setCommunityScale(event.currentTarget.value as CommunityScale)
                            }
                            options={[
                              { value: 'fine', label: 'Fine · smaller groups' },
                              { value: 'standard', label: 'Standard' },
                              { value: 'broad', label: 'Broad · larger groups' },
                            ]}
                          />
                        </SettingField>
                      )}
                      {grouping !== 'none' && (
                        <SettingField
                          label="Group cohesion"
                          description="Stronger attraction separates groups more clearly, while links still shape each group."
                        >
                          <Select
                            aria-label="Group cohesion"
                            value={cohesion}
                            onChange={(event) => setCohesion(event.currentTarget.value)}
                            options={[
                              { value: 'soft', label: 'Soft' },
                              { value: 'medium', label: 'Medium' },
                              { value: 'strong', label: 'Strong' },
                            ]}
                          />
                        </SettingField>
                      )}
                      <SettingField
                        label="Node spacing"
                        description="Balances link length and repulsion. Fit still adapts the settled layout to the canvas."
                      >
                        <Select
                          aria-label="Node spacing"
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
                    </Stack>
                  </Surface>
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
