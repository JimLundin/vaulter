// The kit on one page (`npm run kit`): every piece, with the design's own content, to compare with
// design/screens/.
import { createRoot } from 'react-dom/client';
import {
  Avatar,
  Bars,
  Brand,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Checkbox,
  Chip,
  Choices,
  Cite,
  CodeDiff,
  Columns,
  Count,
  Details,
  Dot,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  Heading,
  Icon,
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
  iconNames,
  Kbd,
  KeyHint,
  Link,
  List,
  ListItem,
  MapView,
  Mark,
  MobileBar,
  VoiceButton,
  Notice,
  Page,
  Panel,
  Prose,
  Recording,
  MobileActionButton,
  Row,
  SearchButton,
  Separator,
  Sources,
  Sparkline,
  Stack,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Text,
  Textarea,
  ThemeSwitch,
  Timeline,
  TimelineItem,
  Toaster,
  ToggleGroup,
  ToggleGroupItem,
  toast,
} from './index.ts';

const MAP_BEFORE = `export default defineExtension({
  id: 'map',
  version: '1.3.0',
  requires: { records, wiki, shell },
  permissions: { network: [] },
  setup({ records, wiki, shell }) {
    shell.addPanel({ id: 'place', target: 'wiki/place', component: PlacePanel });
    shell.addView({ id: 'map', route: '/map', title: 'Map', component: MapScreen });
  },
});`;
const MAP_AFTER = `export default defineExtension({
  id: 'map',
  version: '1.4.0',
  requires: { records, wiki, shell, today },
  permissions: { network: ['routing.example.org'] },
  setup({ records, wiki, shell, today }) {
    shell.addPanel({ id: 'place', target: 'wiki/place', component: PlacePanel });
    shell.addView({ id: 'map', route: '/map', title: 'Map', component: MapScreen });
    today.addSection({ id: 'routes', title: 'How you travelled', component: Routes });
  },
});`;

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Stack gap="md">
      <Heading level={2}>{title}</Heading>
      {children}
      <Separator />
    </Stack>
  );
}

function Gallery() {
  return (
    <Page
      aside={
        <>
          <Details
            items={[
              ['Relation', 'Friend'],
              ['Works at', 'Spotify'],
              ['Birthday', '14 Sep'],
              ['Last seen', 'Today'],
              ['Mentions', '12 notes'],
            ]}
          />
          <Stack gap="sm">
            <Text size="sm" tone="muted">
              Linked pages
            </Text>
            <Row wrap={true} gap="xs">
              <Chip tone="people">Jonas Berg</Chip>
              <Chip tone="places">Café Pascal</Chip>
              <Chip>Spotify</Chip>
              <Chip tone="events">Anna's 35th</Chip>
            </Row>
          </Stack>
          <Panel title="Visits" from="Today">
            <Text size="sm">Today · Fika with Anna</Text>
            <Text size="sm">20 Sep · Working alone, 2 h</Text>
          </Panel>
          <Panel title="Is this the same place?" from="Questions" notice={true}>
            <Row gap="sm">
              <Button variant="outline">Same place</Button>
              <Button variant="outline">Different</Button>
            </Row>
          </Panel>
        </>
      }
    >
      <Stack gap="xs">
        <Text size="xs" tone="muted">
          People › Friends
        </Text>
        <Heading level={1} serif={true}>
          Anna Berg
        </Heading>
        <Row gap="sm">
          <Text size="xs" tone="muted">
            Revised by Vaulter today 11:52 from 1 new note
          </Text>
          <KeyHint keys="H" label="History" />
          <KeyHint keys="E" label="Edit" />
        </Row>
      </Stack>
      <Prose>
        <p>
          Anna is a close friend and former colleague from your time at Klarna, where you met in
          2019. You usually meet at <Link>Café Pascal</Link> on Södermalm.
        </p>
      </Prose>
      <Notice title="Start date unclear:" action={<KeyHint keys="Q" label="Resolve" />}>
        November (today) or December (26 Aug)?
      </Notice>

      <Section title="Appearance">
        <ThemeSwitch />
      </Section>

      <Section title="Type">
        <Heading level={1}>Today</Heading>
        <Heading level={2}>Section heading</Heading>
        <Heading level={3}>Group heading</Heading>
        <Text>Body text, 15 px.</Text>
        <Text size="sm" tone="muted">
          Muted, 13 px
        </Text>
        <Text size="xs" tone="subtle">
          Subtle, 12 px
        </Text>
        <Text mono={true} size="sm">
          routeBetween · read
        </Text>
      </Section>

      <Section title="Buttons">
        <Row wrap={true}>
          <Button>Approve 1.4</Button>
          <Button variant="outline">Not now</Button>
          <Button variant="secondary">Later</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="link">Review change</Button>
          <Button size="icon" variant="outline">
            <Icon name="more" label="More" />
          </Button>
        </Row>
        <ToggleGroup type="single" variant="outline" defaultValue="read">
          <ToggleGroupItem value="read">Read</ToggleGroupItem>
          <ToggleGroupItem value="write">Write</ToggleGroupItem>
          <ToggleGroupItem value="ask">Ask me</ToggleGroupItem>
        </ToggleGroup>
        <Row gap="sm">
          <Checkbox defaultChecked={true} />
          <Text as="span" size="sm">
            Allow this network access
          </Text>
        </Row>
      </Section>

      <Section title="Tones, counts, keys">
        <Row wrap={true}>
          <Dot tone="people" />
          <Dot tone="places" />
          <Dot tone="events" />
          <Count n={2} />
          <Kbd>/</Kbd>
          <KeyHint keys="Space" label="Hold to add to Anna's page" strong={true} />
          <KeyHint keys="g p" label="People" />
        </Row>
        <Row>
          <SearchButton label="Search" keys="/" onClick={() => undefined} />
          <Brand />
        </Row>
      </Section>

      <Section title="Quotes, sources, people">
        <Text tone="body">
          Had fika with <Mark tone="people">Anna</Mark> at the usual place. She's starting at{' '}
          <Mark>Spotify</Mark> in November, and her brother <Mark unsure={true}>Jonas</Mark> is
          moving.
          <Cite n={[1, 2]} />
        </Text>
        <Sources
          items={[
            { id: 'n1', label: 'After-work at Pelikan', meta: '22 Aug', onClick: () => undefined },
            { id: 'n2', label: 'Fika with Anna', meta: 'today', onClick: () => undefined },
          ]}
        />
        <Row>
          <Avatar name="Anna Berg" />
          <Avatar name="Café Pascal" tone="places" />
          <Recording seconds={23} />
        </Row>
        <List marker="plus">
          <ListItem>A Workout page type</ListItem>
          <ListItem>A weekly chart on Today</ListItem>
        </List>
      </Section>

      <Section title="Fields and columns">
        <InputGroup>
          <InputGroupAddon>
            <Icon name="search" />
          </InputGroupAddon>
          <InputGroupInput placeholder="When did I last see Anna?" />
          <InputGroupAddon align="inline-end">
            <InputGroupButton size="icon-xs">
              <Icon name="mic" label="Speak" />
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
        <Textarea placeholder="Or say it in words" />
        <Choices
          numbered={true}
          suggested="nov"
          choices={[
            { id: 'nov', label: 'November' },
            { id: 'dec', label: 'December' },
            { id: 'unsure', label: 'Not sure, keep both, ask later' },
          ]}
          onChoose={(_, c) => toast(`Chose ${c}`)}
        />
        <Choices
          layout="inline"
          choices={[
            { id: 'same', label: 'Same place' },
            { id: 'other', label: 'Different' },
          ]}
          onChoose={(_, c) => toast(`Chose ${c}`)}
        />
        <Row>
          <Button
            variant="outline"
            onClick={() =>
              toast('Added a fact to Anna Berg', {
                action: { label: 'Undo', onClick: () => undefined },
              })
            }
          >
            Show a toast
          </Button>
        </Row>
      </Section>

      <Section title="Charts">
        <Columns count={2} stack={true}>
          <Stack gap="sm">
            <Text size="sm" tone="muted">
              Kilometres run per week
            </Text>
            <Bars
              label="Kilometres run per week"
              unit="km"
              data={[
                { label: '25 Aug', value: 8 },
                { label: '1 Sep', value: 14 },
                { label: '8 Sep', value: 11 },
                { label: '15 Sep', value: 19 },
                { label: '22 Sep', value: 12 },
                { label: '29 Sep', value: 31 },
              ]}
            />
          </Stack>
          <Stack gap="sm">
            <Text size="sm" tone="muted">
              Notes per day, two weeks
            </Text>
            <Sparkline
              label="Notes per day"
              unit="notes"
              values={[3, 5, 2, 6, 4, 7, 5, 8, 6, 4, 9, 7, 6, 10]}
              labels={Array.from({ length: 14 }, (_, i) => `${21 + i} Sep`)}
            />
          </Stack>
        </Columns>
      </Section>

      <Section title="Code diff">
        <CodeDiff path="extensions/map/index.ts" before={MAP_BEFORE} after={MAP_AFTER} />
      </Section>

      <Section title="Map">
        <MapView
          label="Today's places"
          points={[
            { id: 'dj', label: 'Djurgården', n: 1, at: { lat: 59.3266, lon: 18.1152 } },
            { id: 'home', label: 'Home', n: 2, at: { lat: 59.3155, lon: 18.0706 } },
            { id: 'cafe', label: 'Café Pascal', n: 3, at: { lat: 59.3118, lon: 18.0779 } },
          ]}
          routes={[
            {
              id: 'run',
              dashed: true,
              points: [
                { lat: 59.3266, lon: 18.1152 },
                { lat: 59.3235, lon: 18.0952 },
                { lat: 59.3155, lon: 18.0706 },
              ],
            },
            {
              id: 'walk',
              points: [
                { lat: 59.3155, lon: 18.0706 },
                { lat: 59.3118, lon: 18.0779 },
              ],
            },
          ]}
        />
      </Section>

      <Section title="Timeline">
        <Timeline>
          <TimelineItem time="07:10">
            <Text weight="semibold">Djurgården</Text>
            <Text size="sm" tone="muted">
              Morning run · 45 min
            </Text>
          </TimelineItem>
          <TimelineItem time="11:30">
            <Text weight="semibold">Café Pascal</Text>
            <Card>
              <CardHeader>
                <CardTitle>Fika with Anna</CardTitle>
                <CardDescription>Updated 2 wiki pages: Anna Berg, Jonas Berg</CardDescription>
              </CardHeader>
            </Card>
          </TimelineItem>
          <TimelineItem time="Now" now={true}>
            <Text size="sm" tone="muted">
              Evening: Erik's 40th, Pelikan 19:00
            </Text>
          </TimelineItem>
        </Timeline>
      </Section>

      <Section title="Items and tabs">
        <ItemGroup>
          <Item variant="outline" size="sm">
            <ItemMedia>
              <Icon name="mic" />
            </ItemMedia>
            <ItemContent>
              <ItemTitle>Voice capture</ItemTitle>
              <ItemDescription>Record and transcribe notes</ItemDescription>
            </ItemContent>
            <ItemActions>
              <Text size="xs" tone="subtle">
                v1.2
              </Text>
            </ItemActions>
          </Item>
        </ItemGroup>
        <Tabs defaultValue="preview">
          <TabsList>
            <TabsTrigger value="preview">Preview</TabsTrigger>
            <TabsTrigger value="diff">Code diff</TabsTrigger>
          </TabsList>
          <TabsContent value="preview">
            <Card>
              <CardContent>
                <Text size="sm">Before and after.</Text>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
        <Empty>
          <EmptyHeader>
            <EmptyTitle>Nothing to show yet</EmptyTitle>
            <EmptyDescription>An empty state.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      </Section>

      <Section title="Icons">
        <Row wrap={true} gap="md">
          {iconNames.map((n) => (
            <Icon key={n} name={n} label={n} />
          ))}
        </Row>
      </Section>

      <Section title="Mobile controls">
        <MobileBar
          items={[
            <MobileActionButton key="menu" icon="list" label="Menu" current={true} />,
            <MobileActionButton key="search" icon="search" label="Search" />,
            <MobileActionButton key="settings" icon="settings" label="Settings" />,
          ]}
          floating={
            <VoiceButton
              phase="idle"
              busy={false}
              onClick={() => toast('Start a voice interaction')}
            />
          }
        />
      </Section>
    </Page>
  );
}

export function gallery(host: HTMLElement) {
  createRoot(host).render(
    <>
      <Gallery />
      <Toaster />
    </>,
  );
}
