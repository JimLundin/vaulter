// Throwaway comparison: canvas, workbench and atlas on the real Graph route. No design selected yet.
import { useState } from 'react';
import type { ComponentProps } from 'react';
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
  NetworkDiagram,
  PageControls,
  Row,
  SelectionRow,
  Separator,
  Stack,
  Surface,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Text,
} from '../ui/kit/index.ts';

export const graphDesigns = [
  { id: 'canvas', label: 'A · Canvas' },
  { id: 'workbench', label: 'B · Workbench' },
  { id: 'atlas', label: 'C · Atlas' },
] as const;

export function GraphPrototype({
  state,
  node,
  onSelectSubject,
  design,
}: Parameters<NonNullable<ComponentProps<typeof OpenApplication>['renderGraph']>>[0] & {
  design: string;
}) {
  const [query, setQuery] = useState('');
  const [direction, setDirection] = useState('both');
  const [tab, setTab] = useState('explore');
  const { graph, subjects } = state;
  const current =
    subjects.find((subject) => subject.id === node) ??
    subjects
      .filter((subject) => subject.state === 'available')
      .toSorted((a, b) => b.connections - a.connections)[0];
  const select = (id: string) => {
    setTab('explore');
    onSelectSubject(id);
  };
  const matching = subjects.filter((subject) =>
    subject.title.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
  );
  const edges =
    current && graph
      ? graph.relationships(
          { node: current.id },
          {
            direction:
              direction === 'incoming'
                ? 'incoming'
                : direction === 'outgoing'
                  ? 'outgoing'
                  : 'both',
          },
        )
      : [];
  const neighbors = subjects.filter(
    (subject) =>
      subject.id !== current?.id &&
      edges.some(
        (edge) =>
          edge.source.address?.node === subject.id || edge.target.address?.node === subject.id,
      ),
  );
  const diagramNodes = current ? [current, ...neighbors].slice(0, 7) : [];
  const diagram = current ? (
    <NetworkDiagram
      label={`Connections around ${current.title}`}
      nodes={diagramNodes.map((subject) => ({
        id: subject.id,
        label: subject.title,
        selected: subject.id === current.id,
      }))}
      edges={edges
        .filter((edge) => edge.source.address && edge.target.address)
        .map((edge) => ({
          id: edge.node.key.node,
          source: edge.source.address!.node,
          target: edge.target.address!.node,
          label: edge.label,
        }))}
      onSelect={select}
    />
  ) : null;
  const groups = [...new Set(edges.map((edge) => edge.label))];
  const relationships = (
    <Stack gap="lg">
      {groups.map((label) => (
        <Stack key={label} gap="sm">
          <Row>
            <Heading level={3}>{label}</Heading>
            <Badge>{edges.filter((edge) => edge.label === label).length}</Badge>
          </Row>
          {edges
            .filter((edge) => edge.label === label)
            .map((edge) => {
              const endpoint = edge.direction === 'outgoing' ? edge.target : edge.source;
              const subject = subjects.find((entry) => entry.id === endpoint.address?.node);
              return (
                <Row key={edge.node.key.node}>
                  <Icon
                    name={edge.direction === 'outgoing' ? 'arrow-up-right' : 'arrow-left'}
                    size="sm"
                  />
                  <Stack gap="xs">
                    {subject ? (
                      <Button variant="ghost" onClick={() => select(subject.id)}>
                        {subject.title}
                      </Button>
                    ) : (
                      <Text>{edge.data.label ?? 'Unresolved subject'}</Text>
                    )}
                    <Text size="sm" tone="muted">
                      {edge.direction === 'outgoing' ? 'Outgoing' : 'Incoming'}
                      {endpoint.state !== 'available' ? ` · ${endpoint.state}` : ''}
                      {endpoint.address?.transaction ? ' · recorded version' : ''}
                    </Text>
                  </Stack>
                </Row>
              );
            })}
          <Separator />
        </Stack>
      ))}
      {!edges.length && <Text tone="muted">No connections in this direction.</Text>}
    </Stack>
  );
  const subjectList = (
    <Stack gap="xs">
      {matching.map((subject) => (
        <SelectionRow
          key={subject.id}
          selected={subject.id === current?.id}
          onSelect={() => select(subject.id)}
        >
          <Row justify="between" grow={true}>
            <Text>{subject.title}</Text>
            <Badge>{subject.connections}</Badge>
          </Row>
        </SelectionRow>
      ))}
      {!matching.length && <Text>No subjects found.</Text>}
    </Stack>
  );
  const heading = (
    <Stack gap="sm">
      <Text size="sm" tone="muted">
        YOUR VAULT · {subjects.length} SUBJECTS
      </Text>
      <Heading level={1}>{current?.title ?? 'Graph'}</Heading>
      <Row>
        <Badge>{edges.length} connections</Badge>
        {!!current?.href && (
          <Link href={current.href}>
            Open source <Icon name="arrow-up-right" size="sm" />
          </Link>
        )}
      </Row>
    </Stack>
  );
  const controls = (
    <PageControls
      search={{
        type: 'search',
        label: 'Find graph subjects',
        placeholder: 'Find a person, place or idea…',
        value: query,
        onValueChange: setQuery,
      }}
      filters={{
        label: 'Connection direction',
        value: direction,
        active: direction !== 'both',
        onValueChange: setDirection,
        options: [
          { value: 'both', label: 'All connections' },
          { value: 'outgoing', label: 'Outgoing' },
          { value: 'incoming', label: 'Incoming' },
        ],
      }}
    />
  );
  return (
    <FeaturePage
      title="Graph"
      description={
        design === 'canvas'
          ? 'Follow a thread. See what it connects.'
          : design === 'workbench'
            ? 'Find a subject. Inspect its connections.'
            : 'Browse the connections that give your notes meaning.'
      }
    >
      <Stack gap="xl" inset="page" block="lg">
        {!!state.loading && <Loader>Opening connections…</Loader>}
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList aria-label="Graph views">
            <TabsTrigger value="explore">Explore</TabsTrigger>
            <TabsTrigger value="vocabulary">Vocabulary</TabsTrigger>
          </TabsList>
          <TabsContent value="explore">
            <Stack gap="lg">
              {controls}
              {design === 'canvas' ? (
                <>
                  {heading}
                  <Surface variant="subtle">{diagram}</Surface>
                  <Row>
                    <Icon name="network" />
                    <Text size="sm" tone="muted">
                      Choose a connected subject to recenter the map.
                    </Text>
                  </Row>
                  <Columns>
                    <Stack gap="lg">
                      <Heading level={2}>Jump to a subject</Heading>
                      {subjectList}
                    </Stack>
                    <Stack gap="lg">
                      <Heading level={2}>Connections</Heading>
                      {relationships}
                    </Stack>
                  </Columns>
                </>
              ) : design === 'workbench' ? (
                <Columns>
                  <Stack gap="lg">
                    <Row>
                      <Icon name="search" />
                      <Heading level={2}>Subjects</Heading>
                    </Row>
                    {subjectList}
                  </Stack>
                  <Surface variant="subtle">
                    {heading}
                    <Separator />
                    {diagram}
                    <Heading level={2}>Connection details</Heading>
                    {relationships}
                  </Surface>
                </Columns>
              ) : (
                <>
                  {heading}
                  <Separator />
                  <Columns>
                    <Stack gap="xl">
                      <Heading level={2}>Connected subjects</Heading>
                      {groups.map((label) => (
                        <Stack key={label} gap="sm">
                          <Text size="sm" weight="medium" tone="muted">
                            {label.toLocaleUpperCase()}
                          </Text>
                          {edges
                            .filter((edge) => edge.label === label)
                            .map((edge) => {
                              const endpoint =
                                edge.direction === 'outgoing' ? edge.target : edge.source;
                              const subject = subjects.find(
                                (entry) => entry.id === endpoint.address?.node,
                              );
                              return (
                                <Card key={edge.node.key.node}>
                                  <CardContent>
                                    <Stack gap="sm">
                                      <Row justify="between">
                                        <Icon name="file" />
                                        <Badge>
                                          {edge.direction === 'outgoing' ? 'From here' : 'To here'}
                                        </Badge>
                                      </Row>
                                      <Heading level={3}>
                                        {subject?.title ?? edge.data.label ?? 'Unresolved subject'}
                                      </Heading>
                                      <Text size="sm" tone="muted">
                                        {subject?.connections ?? 0} further connections
                                      </Text>
                                      {subject && (
                                        <Button
                                          variant="outline"
                                          onClick={() => select(subject.id)}
                                        >
                                          Follow connection <Icon name="arrow-up-right" size="sm" />
                                        </Button>
                                      )}
                                    </Stack>
                                  </CardContent>
                                </Card>
                              );
                            })}
                        </Stack>
                      ))}
                      {!edges.length && <Text>No connections in this direction.</Text>}
                    </Stack>
                    <Stack gap="lg">
                      <Heading level={2}>Browse the vault</Heading>
                      {subjectList}
                      <Surface variant="subtle">
                        <Text size="sm" tone="muted">
                          A relationship is recorded once. You can follow it from either subject.
                        </Text>
                      </Surface>
                    </Stack>
                  </Columns>
                </>
              )}
            </Stack>
          </TabsContent>
          <TabsContent value="vocabulary">
            <Stack gap="lg">
              {graph?.vocabulary().map((term) => (
                <Card key={term.node.key.node}>
                  <CardContent>
                    <Stack gap="sm">
                      <Row>
                        <Heading level={3}>{term.data.label ?? term.data.key}</Heading>
                        <Badge>{term.data.scheme}</Badge>
                      </Row>
                      {!!term.data.use && <Text>{term.data.use}</Text>}
                      <Button variant="ghost" onClick={() => select(term.node.key.node)}>
                        Explore {term.data.label ?? term.data.key}
                      </Button>
                    </Stack>
                  </CardContent>
                </Card>
              ))}
            </Stack>
          </TabsContent>
        </Tabs>
      </Stack>
    </FeaturePage>
  );
}
