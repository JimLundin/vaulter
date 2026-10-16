import { useState } from 'react';
import {
  Badge,
  Button,
  Card,
  CardContent,
  Columns,
  FeaturePage,
  Heading,
  Link,
  Loader,
  NetworkDiagram,
  PageControls,
  Row,
  SelectionRow,
  Stack,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Text,
} from '../../ui/kit/index.ts';
import { go } from '../../navigation/routing.ts';
import type { GraphExplorerState } from './explorer.ts';
import type { GraphEndpoint } from './reading.ts';
import { graphSubjectRoute } from './routes.ts';

export function GraphPage({
  state,
  node,
  onNavigate = go,
  onRetry,
}: {
  state: GraphExplorerState;
  node?: string;
  onNavigate?: (href: string) => void;
  onRetry?: () => void;
}) {
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState('connections');
  const [direction, setDirection] = useState<'both' | 'incoming' | 'outgoing'>('both');
  const { graph, subjects, loading, error } = state;
  const selected = node
    ? subjects.find((subject) => subject.id === node)
    : subjects
        .filter((subject) => subject.state === 'available')
        .toSorted((a, b) => b.connections - a.connections)[0];
  const matching = subjects.filter((subject) =>
    subject.title.toLocaleLowerCase().includes(search.toLocaleLowerCase()),
  );
  const select = (id: string) => {
    setTab('connections');
    onNavigate(graphSubjectRoute.href({ node: id }));
  };
  const relationships =
    selected && graph ? graph.relationships({ node: selected.id }, { direction }) : [];
  const titleOf = (endpoint: GraphEndpoint, fallback?: string) =>
    subjects.find((subject) => subject.id === endpoint.address?.node)?.title ||
    fallback ||
    'Unavailable subject';
  const nearby = selected
    ? [
        selected,
        ...subjects.filter(
          (subject) =>
            subject.id !== selected.id &&
            relationships.some(
              (edge) =>
                edge.source.address?.node === subject.id ||
                edge.target.address?.node === subject.id,
            ),
        ),
      ].slice(0, 7)
    : [];
  const diagramEdges = relationships
    .filter(
      (edge) =>
        edge.source.address &&
        edge.target.address &&
        nearby.some((subject) => subject.id === edge.source.address?.node) &&
        nearby.some((subject) => subject.id === edge.target.address?.node),
    )
    .map((edge) => ({
      id: edge.node.key.node,
      source: edge.source.address!.node,
      target: edge.target.address!.node,
      label: edge.data.predicate,
    }));
  return (
    <FeaturePage title="Graph" description="Explore how people, places and ideas connect.">
      <Stack gap="lg" inset="page" block="lg">
        {!!error && (
          <Row>
            <Text role="alert" tone="danger">
              {error}
            </Text>
            {onRetry && <Button onClick={onRetry}>Retry Graph</Button>}
          </Row>
        )}
        {!!loading && <Loader>{graph ? 'Refreshing connections…' : 'Opening Graph…'}</Loader>}
        {!!graph && !!error && <Text tone="muted">Showing previously loaded connections.</Text>}
        {!(graph || loading || error) && <Text>Graph is unavailable.</Text>}
        {graph && !subjects.length && (
          <Text>
            No connections yet. Relationships and vocabulary in your vault will appear here.
          </Text>
        )}
        {graph && !!subjects.length && (
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList aria-label="Graph views">
              <TabsTrigger value="connections">Connections</TabsTrigger>
              <TabsTrigger value="vocabulary">Vocabulary</TabsTrigger>
            </TabsList>
            <TabsContent value="connections">
              <Stack gap="lg">
                <PageControls
                  search={{
                    type: 'search',
                    label: 'Find graph subjects',
                    placeholder: 'Find a person, place or idea…',
                    value: search,
                    onValueChange: setSearch,
                  }}
                  filters={{
                    type: 'single',
                    label: 'Relationship direction',
                    value: direction,
                    options: [
                      { value: 'both', label: 'All connections' },
                      { value: 'outgoing', label: 'Outgoing' },
                      { value: 'incoming', label: 'Incoming' },
                    ],
                    active: direction !== 'both',
                    onValueChange: (value) => {
                      if (value === 'both' || value === 'incoming' || value === 'outgoing')
                        setDirection(value);
                    },
                  }}
                />
                <Columns>
                  <Stack gap="xs">
                    <Heading level={2}>Subjects</Heading>
                    {matching.map((subject) => (
                      <SelectionRow
                        key={subject.id}
                        selected={subject.id === selected?.id}
                        onSelect={() => select(subject.id)}
                      >
                        <Stack gap="xs">
                          <Text>{subject.title}</Text>
                          <Text size="sm" tone="muted">
                            {subject.state === 'deleted'
                              ? 'Deleted subject'
                              : `${subject.connections} ${subject.connections === 1 ? 'connection' : 'connections'}`}
                          </Text>
                        </Stack>
                      </SelectionRow>
                    ))}
                    {!matching.length && <Text>No subjects found.</Text>}
                  </Stack>
                  <Stack gap="lg">
                    {node && !selected && (
                      <Text role="status">
                        This subject is unavailable or no longer has connections.
                      </Text>
                    )}
                    {selected && (
                      <>
                        <Row>
                          <Heading level={2}>{selected.title}</Heading>
                          {selected.state === 'deleted' && <Badge>Deleted</Badge>}
                          {selected.href && selected.state === 'available' && (
                            <Link href={selected.href}>Open source</Link>
                          )}
                        </Row>
                        <NetworkDiagram
                          label={`Connections around ${selected.title}`}
                          nodes={nearby.map((subject) => ({
                            id: subject.id,
                            label: subject.title,
                            selected: subject.id === selected.id,
                          }))}
                          edges={diagramEdges}
                          onSelect={select}
                        />
                        {nearby.length <
                          new Set(
                            relationships
                              .flatMap((edge) => [
                                edge.source.address?.node,
                                edge.target.address?.node,
                              ])
                              .filter(Boolean),
                          ).size && (
                          <Text size="sm" tone="muted">
                            The diagram shows six nearby subjects. All connections are listed below.
                          </Text>
                        )}
                        <Heading level={3}>Relationships</Heading>
                        {!relationships.length && (
                          <Text>
                            No {direction === 'both' ? '' : `${direction} `}relationships for this
                            subject.
                          </Text>
                        )}
                        {relationships.map((edge) => {
                          const endpoint =
                            edge.direction === 'outgoing' ? edge.target : edge.source;
                          const title = titleOf(endpoint, edge.data.label);
                          return (
                            <Card key={edge.node.key.node}>
                              <CardContent>
                                <Stack gap="sm">
                                  <Row>
                                    <Text weight="medium">{edge.label}</Text>
                                    <Badge>
                                      {edge.direction === 'outgoing' ? 'Outgoing' : 'Incoming'}
                                    </Badge>
                                  </Row>
                                  {endpoint.address ? (
                                    <Button
                                      variant="ghost"
                                      onClick={() => select(endpoint.address!.node)}
                                    >
                                      Explore {title}
                                    </Button>
                                  ) : (
                                    <Text>{title}</Text>
                                  )}
                                  {endpoint.state !== 'available' && (
                                    <Text tone="muted" size="sm">
                                      {endpoint.state === 'unresolved'
                                        ? 'Unresolved connection'
                                        : endpoint.state === 'deleted'
                                          ? 'Deleted subject'
                                          : 'Subject unavailable'}
                                    </Text>
                                  )}
                                  {endpoint.address?.transaction && (
                                    <Text tone="muted" size="sm">
                                      Recorded version
                                      {endpoint.current?.data === null
                                        ? ' · current subject deleted'
                                        : endpoint.current?.key.transaction !==
                                            endpoint.version?.key.transaction
                                          ? ' · a newer version exists'
                                          : ''}
                                    </Text>
                                  )}
                                </Stack>
                              </CardContent>
                            </Card>
                          );
                        })}
                      </>
                    )}
                  </Stack>
                </Columns>
              </Stack>
            </TabsContent>
            <TabsContent value="vocabulary">
              <Stack gap="lg">
                {graph.vocabulary().map((term) => (
                  <Card key={term.node.key.node}>
                    <CardContent>
                      <Stack gap="sm">
                        <Row>
                          <Heading level={3}>{term.data.label ?? term.data.key}</Heading>
                          <Badge>{term.data.scheme}</Badge>
                        </Row>
                        {term.data.use && <Text>{term.data.use}</Text>}
                        {term.data.inverse && (
                          <Text size="sm" tone="muted">
                            Inverse: {term.data.inverse}
                          </Text>
                        )}
                        {term.data.symmetric && (
                          <Text size="sm" tone="muted">
                            Same relationship in both directions
                          </Text>
                        )}
                        <Button variant="ghost" onClick={() => select(term.node.key.node)}>
                          Explore {term.data.label ?? term.data.key}
                        </Button>
                      </Stack>
                    </CardContent>
                  </Card>
                ))}
                {!graph.vocabulary().length && <Text>No vocabulary terms yet.</Text>}
              </Stack>
            </TabsContent>
          </Tabs>
        )}
      </Stack>
    </FeaturePage>
  );
}
