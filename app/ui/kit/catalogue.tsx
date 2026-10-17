// Every public presentation component has a live example here. CI checks this against index.ts.
import { type ComponentType, useEffect, useId, useRef, useState } from 'react';
// biome-ignore lint/performance/noNamespaceImport: the standalone catalogue deliberately renders the whole public kit.
import * as K from './index.ts';

export interface Specimen {
  id: string;
  title: string;
  description: string;
  components: (keyof typeof K)[];
  Sample: ComponentType;
  fullBleed?: boolean;
}
const noop = () => undefined;
const patch = '@@ -1 +1 @@\n-Leave mornings full.\n+Leave space for slow mornings.';

function Typography() {
  return (
    <K.Stack gap="lg">
      <K.Heading level={1} serif={true}>
        Room to think
      </K.Heading>
      <K.Heading level={1}>A page title</K.Heading>
      <K.Heading level={2}>A section heading</K.Heading>
      <K.Heading level={3}>A group heading</K.Heading>
      <K.Text lines={3}>
        Body copy stays readable at every size. Preview prose can be bounded within a fitted
        workspace.
      </K.Text>
      <K.Text size="sm" tone="muted">
        Secondary text
      </K.Text>
      <K.Text size="xs" tone="subtle">
        Metadata · Today at 09:41
      </K.Text>
      <K.Text mono={true}>notes/slow-mornings.md</K.Text>
      <K.Prose>
        <p>
          Notes connect people, places and ideas. Follow a{' '}
          <K.Link href="#typography">linked thought</K.Link>, then return when you’re ready.
        </p>
      </K.Prose>
      <K.Row wrap={true}>
        <K.Kbd>⌘</K.Kbd>
        <K.KeyHint keys="g h" label="Open history" />
        <K.Spacer />
        <K.Text size="xs">Shared type roles</K.Text>
      </K.Row>
    </K.Stack>
  );
}
function Buttons() {
  const [count, setCount] = useState(0);
  const [choice, setChoice] = useState<string>();
  return (
    <K.Stack gap="lg">
      <K.Row wrap={true}>
        <K.Button onClick={() => setCount(count + 1)}>Save note</K.Button>
        <K.Button compactIcon="plus" aria-label="Add event" title="Add event">
          Add event
        </K.Button>
        <K.Button variant="outline">Cancel</K.Button>
        <K.Button variant="ghost">More</K.Button>
        <K.Link href="#typography">Open note</K.Link>
        <K.Button variant="destructive">Delete</K.Button>
        <K.Button disabled={true}>Unavailable</K.Button>
      </K.Row>
      <K.Row wrap={true}>
        <K.Button size="compact">Compact</K.Button>
        <K.Button size="standard">Standard</K.Button>
        <K.Button variant="ghost" size="standard" iconOnly={true} aria-label="Square action">
          <K.Icon name="settings" />
        </K.Button>
        <K.Button size="compact" iconOnly={true} aria-label="Add note">
          <K.Icon name="plus" />
        </K.Button>
      </K.Row>
      <K.Text size="sm" tone="muted">
        Saved {count} times in this example.
      </K.Text>
      <K.Stack gap="sm" role="group" aria-label="Card choices">
        {['Morning walk', 'An evening at home'].map((label) => (
          <K.SelectionRow
            key={label}
            appearance="card"
            selected={choice === label}
            onSelect={() => setChoice(label)}
          >
            <K.Stack gap="xs">
              <K.Text as="span" size="sm" weight="medium">
                {label}
              </K.Text>
              <K.Text as="span" size="sm" tone="muted">
                A starting point that leaves room for your own plans.
              </K.Text>
            </K.Stack>
          </K.SelectionRow>
        ))}
      </K.Stack>
      <K.SelectionRow
        appearance="navigation"
        selected={false}
        aria-label="Read a page"
        onSelect={noop}
      >
        <K.Text as="span">Read a page</K.Text>
      </K.SelectionRow>
      <K.ToggleGroup type="single" aria-label="Date range" defaultValue="day">
        <K.ToggleGroupItem value="day">Day</K.ToggleGroupItem>
        <K.ToggleGroupItem value="week">Week</K.ToggleGroupItem>
        <K.ToggleGroupItem value="month">Month</K.ToggleGroupItem>
      </K.ToggleGroup>
      <K.ToggleGroup type="multiple" aria-label="Formatting choices" defaultValue={['bold']}>
        <K.ToggleGroupItem value="bold">Bold</K.ToggleGroupItem>
        <K.ToggleGroupItem value="italic">Italic</K.ToggleGroupItem>
        <K.ToggleGroupItem value="underline" disabled={true}>
          Underline
        </K.ToggleGroupItem>
      </K.ToggleGroup>
      <K.TooltipProvider>
        <K.Tooltip>
          <K.TooltipTrigger
            render={<K.Button variant="outline">Hover or focus for help</K.Button>}
          />
          <K.TooltipContent>Save this note to your vault.</K.TooltipContent>
        </K.Tooltip>
      </K.TooltipProvider>
    </K.Stack>
  );
}
function Status() {
  const [placeSelections, setPlaceSelections] = useState(0);
  const [toasterId] = useState(() => `kit-${crypto.randomUUID()}`);
  return (
    <K.Stack gap="lg">
      <K.Row wrap={true}>
        <K.Badge>Draft</K.Badge>
        <K.Badge variant="secondary">Saved</K.Badge>
        <K.Badge variant="destructive">Needs attention</K.Badge>
        <K.Chip tone="people">Anna</K.Chip>
        <K.Chip tone="places" onClick={() => setPlaceSelections((count) => count + 1)}>
          Pascal
        </K.Chip>
        <K.Chip tone="events">Dinner</K.Chip>
        <K.Row gap="xs">
          <K.Dot tone="places" />
          <K.Text size="xs">Places</K.Text>
        </K.Row>
        <K.Count n={3} />
      </K.Row>
      <K.Text size="xs">
        Pascal selected {placeSelections} {placeSelections === 1 ? 'time' : 'times'}.
      </K.Text>
      <K.Notice title="A detail needs your attention" action={<K.Icon name="chevron-right" />}>
        Choose which date to keep.
      </K.Notice>
      <K.Alert>
        <K.AlertTitle>Everything is saved</K.AlertTitle>
        <K.AlertDescription>You can keep working offline.</K.AlertDescription>
      </K.Alert>
      <K.Alert variant="destructive">
        <K.AlertTitle>Couldn’t save</K.AlertTitle>
        <K.AlertDescription>Try again when you have a connection.</K.AlertDescription>
      </K.Alert>
      <K.Row>
        <K.Activity busy={true} label="Thinking" />
        <K.Text size="sm">Thinking about your notes…</K.Text>
      </K.Row>
      <K.LoadingStatus>Loading your vault…</K.LoadingStatus>
      <K.Loader>Opening pages…</K.Loader>
      <K.Separator />
      <K.Button variant="outline" onClick={() => K.toast.success('Note saved', { toasterId })}>
        Show notification
      </K.Button>
      <K.Toaster id={toasterId} />
    </K.Stack>
  );
}
function Fields() {
  const id = useId();
  const [saved, setSaved] = useState(false);
  return (
    <K.Form
      onSubmit={(event) => {
        event.preventDefault();
        setSaved(true);
      }}
    >
      <K.RadioGroup variant="choices" aria-label="Reminder frequency" defaultValue="daily">
        {['daily', 'weekly'].map((value) => (
          <K.RadioGroupItem key={value} value={value}>
            <K.Text as="span">{value}</K.Text>
            <K.RadioGroupIndicator>
              <K.Icon name="check" />
            </K.RadioGroupIndicator>
          </K.RadioGroupItem>
        ))}
      </K.RadioGroup>
      <K.FieldSet>
        <K.FieldLegend>Note preferences</K.FieldLegend>
        <K.FieldGroup>
          <K.Field>
            <K.FieldLabel htmlFor={`${id}-title`}>Title</K.FieldLabel>
            <K.Input id={`${id}-title`} defaultValue="Slow mornings" />
            <K.FieldDescription>A short name you will recognise later.</K.FieldDescription>
          </K.Field>
          <K.Field>
            <K.FieldLabel htmlFor={`${id}-body`}>Notes</K.FieldLabel>
            <K.Textarea id={`${id}-body`} placeholder="Add a few details…" />
          </K.Field>
          <K.Field>
            <K.FieldLabel htmlFor={`${id}-draft`}>Longform draft</K.FieldLabel>
            <K.Textarea
              id={`${id}-draft`}
              variant="longform"
              placeholder="Room to start writing…"
            />
          </K.Field>
          <K.FieldSeparator>Notifications</K.FieldSeparator>
          <K.Field orientation="horizontal">
            <K.Checkbox id={`${id}-reminder`} defaultChecked={true} />
            <K.FieldContent>
              <K.FieldLabel htmlFor={`${id}-reminder`}>
                <K.FieldTitle>Daily reminder</K.FieldTitle>
              </K.FieldLabel>
              <K.FieldDescription>Make time to reflect.</K.FieldDescription>
            </K.FieldContent>
          </K.Field>
          <K.Field data-invalid={true}>
            <K.Label htmlFor={`${id}-email`}>Email</K.Label>
            <K.Input id={`${id}-email`} aria-invalid={true} defaultValue="anna@" />
            <K.FieldError>Enter a complete email address.</K.FieldError>
          </K.Field>
          <K.Field orientation="setting">
            <K.FieldLabel htmlFor={`${id}-model`}>Model</K.FieldLabel>
            <K.FieldContent>
              <K.Select
                id={`${id}-model`}
                defaultValue="balanced"
                options={[
                  { value: 'balanced', label: 'Balanced model' },
                  { value: 'fast', label: 'Fast model' },
                ]}
              />
            </K.FieldContent>
            <K.FieldDescription>The shared settings arrangement.</K.FieldDescription>
          </K.Field>
          <K.Button type="submit">Save preferences</K.Button>
          {!!saved && <K.Text>Preferences saved.</K.Text>}
        </K.FieldGroup>
      </K.FieldSet>
    </K.Form>
  );
}
function GroupedFields() {
  return (
    <K.Stack gap="lg">
      <K.InputGroup>
        <K.InputGroupAddon>
          <K.Icon name="search" />
        </K.InputGroupAddon>
        <K.InputGroupInput aria-label="Find a note" placeholder="Find a note…" />
        <K.InputGroupAddon align="inline-end">
          <K.InputGroupText>⌘ K</K.InputGroupText>
        </K.InputGroupAddon>
      </K.InputGroup>
      <K.InputGroup>
        <K.InputGroupTextarea aria-label="Quick note" placeholder="Write a quick note…" />
        <K.InputGroupAddon align="inset-end">
          <K.InputGroupButton
            variant="filled"
            size="compact"
            iconOnly={true}
            aria-label="Save quick note"
          >
            <K.Icon name="arrow-up" />
          </K.InputGroupButton>
        </K.InputGroupAddon>
      </K.InputGroup>
    </K.Stack>
  );
}
function Cards() {
  return (
    <K.Stack>
      <K.Card>
        <K.CardHeader>
          <K.CardTitle>Slow mornings</K.CardTitle>
          <K.CardDescription>A little room before the day begins.</K.CardDescription>
          <K.CardAction>
            <K.Button variant="ghost" size="compact" iconOnly={true} aria-label="More options">
              <K.Icon name="more" />
            </K.Button>
          </K.CardAction>
        </K.CardHeader>
        <K.CardContent>
          <K.Text>Walk, make coffee, and write down one thought.</K.Text>
        </K.CardContent>
        <K.CardFooter>
          <K.Button variant="outline">Open note</K.Button>
        </K.CardFooter>
      </K.Card>
      <K.Prose>
        <K.Text>Leave the afternoon free for making things.</K.Text>
        <K.Card role="region" aria-label="Card in reading content">
          <K.CardHeader>
            <K.Heading level={2}>A card within a page</K.Heading>
          </K.CardHeader>
          <K.CardContent>
            <K.Text size="sm">Make room for one small project.</K.Text>
          </K.CardContent>
          <K.CardFooter>
            <K.Button>Save note</K.Button>
          </K.CardFooter>
        </K.Card>
      </K.Prose>
    </K.Stack>
  );
}
function Items() {
  const [opened, setOpened] = useState(false);
  return (
    <K.ItemGroup>
      <K.Item>
        <K.ItemHeader>
          <K.Text size="xs">Pinned note</K.Text>
        </K.ItemHeader>
        <K.ItemMedia>
          <K.Avatar name="Anna Berg" />
        </K.ItemMedia>
        <K.ItemContent>
          <K.ItemTitle>Morning walk</K.ItemTitle>
          <K.ItemDescription>With Anna · Today</K.ItemDescription>
        </K.ItemContent>
        <K.ItemActions>
          <K.Button
            variant="ghost"
            size="compact"
            iconOnly={true}
            aria-label="Open morning walk"
            onClick={() => setOpened(true)}
          >
            <K.Icon name="chevron-right" />
          </K.Button>
        </K.ItemActions>
        <K.ItemFooter>
          <K.Text size="xs" tone="muted">
            Saved just now
          </K.Text>
        </K.ItemFooter>
      </K.Item>
      <K.ItemSeparator />
      <K.Item>
        <K.ItemMedia>
          <K.Icon name="file" />
        </K.ItemMedia>
        <K.ItemContent>
          <K.ItemTitle>A quiet weekend</K.ItemTitle>
          <K.ItemDescription>Time outside the city.</K.ItemDescription>
        </K.ItemContent>
      </K.Item>
      <K.ItemSeparator />
      <K.Item current={true} render={<button type="button" aria-label="Current reading note" />}>
        <K.ItemMedia variant="icon">
          <K.Icon name="file" />
        </K.ItemMedia>
        <K.ItemContent>
          <K.ItemTitle>Current reading note</K.ItemTitle>
          <K.ItemDescription>A framed icon and selected-row feedback.</K.ItemDescription>
        </K.ItemContent>
      </K.Item>
      <K.ItemSeparator />
      <K.Item>
        <K.ItemMedia variant="image">
          <img
            alt="Supplied preview thumbnail"
            src={new URL('../../public/icon-192.png', import.meta.url).href}
          />
        </K.ItemMedia>
        <K.ItemContent>
          <K.ItemTitle>A saved picture</K.ItemTitle>
          <K.ItemDescription>Supplied media cropped inside a thumbnail.</K.ItemDescription>
        </K.ItemContent>
      </K.Item>
      <K.Item>
        <K.ItemHeader>
          <K.Text size="xs">Initials in each category</K.Text>
        </K.ItemHeader>
        <K.ItemMedia>
          <K.Avatar name="Neutral Note" tone="neutral" />
        </K.ItemMedia>
        <K.ItemMedia>
          <K.Avatar name="Pascal Place" tone="places" />
        </K.ItemMedia>
        <K.ItemMedia>
          <K.Avatar name="Dinner Event" tone="events" />
        </K.ItemMedia>
      </K.Item>
      {opened ? <K.Text>Opened morning walk.</K.Text> : null}
    </K.ItemGroup>
  );
}
function EmptyStates() {
  return (
    <K.Empty>
      <K.EmptyHeader>
        <K.EmptyMedia variant="icon">
          <K.Icon name="file" />
        </K.EmptyMedia>
        <K.EmptyTitle>No notes yet</K.EmptyTitle>
        <K.EmptyDescription>Your first thought can be a few words.</K.EmptyDescription>
      </K.EmptyHeader>
      <K.EmptyContent>
        <K.Button>Create a note</K.Button>
      </K.EmptyContent>
    </K.Empty>
  );
}
function LinkedContent() {
  const ref = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState(false);
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  useEffect(() => {
    const source = ref.current;
    if (!(hover && source)) return;
    const measure = () => setAnchor(source.getBoundingClientRect());
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(source);
    addEventListener('scroll', measure, true);
    addEventListener('resize', measure);
    return () => {
      observer.disconnect();
      removeEventListener('scroll', measure, true);
      removeEventListener('resize', measure);
    };
  }, [hover]);
  return (
    <K.Stack gap="lg">
      <K.Text>
        Had coffee with <K.Mark tone="people">Anna</K.Mark> at <K.Mark tone="places">Pascal</K.Mark>
        .<K.Cite n={[1, 2]} />
      </K.Text>
      <K.Details
        items={[
          ['Last seen', 'Today'],
          ['Mentions', '12 notes'],
        ]}
      />
      <K.Sources
        items={[
          { id: 'coffee', label: 'Coffee with Anna', meta: 'Today', onClick: noop },
          { id: 'walk', label: 'Morning walk', meta: 'Yesterday', onClick: noop },
        ]}
      />
      <K.Panel title="Related notes" from="History">
        <K.Text size="sm">Morning walk · Quiet weekend</K.Text>
      </K.Panel>
      <K.SourceLabel from="Agent" />
      <K.List>
        <K.ListItem>Leave room for the unexpected.</K.ListItem>
        <K.ListItem>Write down what you notice.</K.ListItem>
      </K.List>
      <div ref={ref}>
        <K.Button variant="outline" onClick={() => setHover(!hover)}>
          Show linked note preview
        </K.Button>
      </div>
      {!!hover && !!anchor && (
        <K.HoverPreview
          title="Coffee with Anna"
          text="A conversation about making time."
          anchor={anchor}
        />
      )}
    </K.Stack>
  );
}
function Layout() {
  return (
    <K.Page aside={<K.Details items={[['Updated', 'Today']]} />}>
      <K.PageHeader title="Slow mornings" description="The same page and details, rearranged." />
      <K.Columns>
        <K.Panel title="Today" from="Notes">
          <K.Text>Take a walk.</K.Text>
        </K.Panel>
        <K.Panel title="Tomorrow" from="Notes">
          <K.Text>Make time for coffee.</K.Text>
        </K.Panel>
      </K.Columns>
    </K.Page>
  );
}
function TabsSample() {
  return (
    <K.Tabs defaultValue="notes">
      <K.TabsList>
        <K.TabsTrigger value="notes">Notes</K.TabsTrigger>
        <K.TabsTrigger value="activity">Today</K.TabsTrigger>
      </K.TabsList>
      <K.TabsContent value="notes">
        <K.Text>Your recent thoughts.</K.Text>
      </K.TabsContent>
      <K.TabsContent value="activity">
        <K.Text>Recent activity appears here.</K.Text>
      </K.TabsContent>
    </K.Tabs>
  );
}
function Charts() {
  const [mapOpen, setMapOpen] = useState(false);
  return (
    <K.Stack gap="xl">
      <K.Bars
        label="Notes this week"
        data={[
          { label: 'Mon', value: 3 },
          { label: 'Tue', value: 5 },
          { label: 'Wed', value: 2 },
          { label: 'Thu', value: 7 },
          { label: 'Fri', value: 4 },
        ]}
      />
      <K.Sparkline label="Notes over time" values={[3, 5, 2, 7, 4, 6, 8]} />
      {mapOpen ? (
        <K.MapView
          markers={[{ id: 'studio', label: 'Studio', latitude: 59.3293, longitude: 18.0686 }]}
          onSelect={noop}
        />
      ) : (
        <K.Button onClick={() => setMapOpen(true)}>Load map</K.Button>
      )}
      <K.NetworkDiagram
        label="Population map"
        actions={
          <K.Button iconOnly={true} aria-label="Map options" onClick={noop}>
            <K.Icon name="settings" />
          </K.Button>
        }
        legend={[
          { label: 'Making', color: '#8b83ec' },
          { label: 'Outside', color: '#39ad93' },
        ]}
        layout="map"
        nodes={[
          { id: 'studio', label: 'Studio', tone: 'topic', group: 'Making', color: '#8b83ec' },
          {
            id: 'tools',
            label: 'Keep tools within reach',
            tone: 'statement',
            group: 'Making',
            color: '#8b83ec',
          },
          {
            id: 'source',
            label: 'Workshop notes',
            tone: 'source',
            group: 'Making',
            color: '#8b83ec',
          },
          { id: 'garden', label: 'Garden', tone: 'topic', group: 'Outside', color: '#39ad93' },
          {
            id: 'question',
            label: 'What should grow here?',
            tone: 'question',
            group: 'Outside',
            color: '#39ad93',
          },
        ]}
        edges={[
          { id: 'one', source: 'studio', target: 'tools', label: 'contains' },
          { id: 'two', source: 'tools', target: 'source', label: 'cites' },
          { id: 'three', source: 'garden', target: 'question', label: 'contains' },
        ]}
        onSelect={noop}
      />
      <K.NetworkDiagram
        label="Related ideas"
        nodes={[
          { id: 'studio', label: 'Garden studio', selected: true },
          { id: 'making', label: 'Making things' },
          { id: 'mornings', label: 'Slow mornings' },
        ]}
        edges={[
          { id: 'one', source: 'studio', target: 'making', label: 'Supports' },
          { id: 'two', source: 'mornings', target: 'studio', label: 'Happens in' },
        ]}
        onSelect={noop}
      />
      <K.NetworkDiagram
        label="Directed reading paths"
        layout="lanes"
        nodes={[
          { id: 'question', label: 'What helps me begin?', detail: 'QUESTION', column: 0 },
          {
            id: 'statement',
            label: 'Prepare a clear surface before starting.',
            detail: 'STATEMENT',
            column: 1,
            selected: true,
          },
          { id: 'source', label: 'Workshop notes', detail: 'SOURCE', column: 2 },
        ]}
        edges={[
          { id: 'context', source: 'question', target: 'statement', label: 'informed by' },
          { id: 'citation', source: 'statement', target: 'source', label: 'cites passage' },
        ]}
        onSelect={noop}
      />
    </K.Stack>
  );
}
function Changes() {
  return (
    <K.Stack gap="lg">
      <K.CodeDiff
        path="notes/morning.ts"
        before='const morning = "busy";'
        after='const morning = "slow";'
      />
      <K.UnifiedDiff path="notes/slow-mornings.md" patch={patch} />
      <K.ToolResult
        title="Save note"
        status="Saved"
        input={{ path: 'notes/slow-mornings.md' }}
        output={<K.Json value={{ saved: true }} />}
      />
      <K.ToolGroup summary="Read 2 files · staged 1 file · check passes" count={4}>
        <K.ToolResult
          title="readFile · notes/slow-mornings.md"
          status="ok"
          input={{ path: 'notes/slow-mornings.md' }}
        />
        <K.ToolResult
          title="readFile · notes/coffee.md"
          status="ok"
          input={{ path: 'notes/coffee.md' }}
        />
        <K.ToolResult
          title="writeFile · notes/slow-mornings.md"
          status="staged: notes/slow-mornings.md"
          input={{ path: 'notes/slow-mornings.md' }}
        />
        <K.ToolResult title="check" status="check passes" input={{}} />
      </K.ToolGroup>
      <K.LiveStatus>Reading notes/coffee.md…</K.LiveStatus>
    </K.Stack>
  );
}
function Menus() {
  const [pinned, setPinned] = useState(true);
  const [sort, setSort] = useState('recent');
  return (
    <K.DropdownMenu>
      <K.DropdownMenuTrigger
        render={
          <K.Button variant="outline">
            Note options
            <K.Icon name="chevron-right" />
          </K.Button>
        }
      />
      <K.DropdownMenuContent>
        <K.DropdownMenuLabel>Slow mornings</K.DropdownMenuLabel>
        <K.DropdownMenuGroup>
          <K.DropdownMenuItem>
            Open note<K.DropdownMenuShortcut>↵</K.DropdownMenuShortcut>
          </K.DropdownMenuItem>
          <K.DropdownMenuCheckboxItem checked={pinned} onCheckedChange={setPinned}>
            Pinned
          </K.DropdownMenuCheckboxItem>
        </K.DropdownMenuGroup>
        <K.DropdownMenuSeparator />
        <K.DropdownMenuRadioGroup value={sort} onValueChange={setSort}>
          <K.DropdownMenuRadioItem value="recent">Recent first</K.DropdownMenuRadioItem>
          <K.DropdownMenuRadioItem value="title">By title</K.DropdownMenuRadioItem>
        </K.DropdownMenuRadioGroup>
        <K.DropdownMenuSub>
          <K.DropdownMenuSubTrigger>Move to</K.DropdownMenuSubTrigger>
          <K.DropdownMenuSubContent>
            <K.DropdownMenuItem>Personal</K.DropdownMenuItem>
            <K.DropdownMenuItem>Work</K.DropdownMenuItem>
          </K.DropdownMenuSubContent>
        </K.DropdownMenuSub>
      </K.DropdownMenuContent>
    </K.DropdownMenu>
  );
}
function Dialogs() {
  const [review, setReview] = useState(false);
  const [title, setTitle] = useState('Slow mornings');
  const [drawer, setDrawer] = useState(false);
  return (
    <K.Stack gap="lg">
      <K.Button variant="outline" onClick={() => setReview(true)}>
        Open note review
      </K.Button>
      <K.Overlay
        open={review}
        onClose={() => setReview(false)}
        title="Keep this note?"
        description="You can change your mind later."
      >
        <K.Input
          aria-label="Note title"
          value={title}
          onChange={(event) => setTitle(event.currentTarget.value)}
        />
        <K.DialogFooter>
          <K.Button variant="outline" onClick={() => setReview(false)}>
            Cancel
          </K.Button>
          <K.Button onClick={() => setReview(false)}>Keep note</K.Button>
        </K.DialogFooter>
      </K.Overlay>
      <K.Button variant="outline" onClick={() => setDrawer(true)}>
        Open drawer
      </K.Button>
      <K.Drawer
        open={drawer}
        onClose={() => setDrawer(false)}
        title="Related notes"
        description="Thoughts connected to this one."
      >
        <K.Text>Connections to explore alongside your current note.</K.Text>
      </K.Drawer>
    </K.Stack>
  );
}
function Review() {
  const [open, setOpen] = useState(false);
  return (
    <K.Stack>
      <K.Button variant="outline" onClick={() => setOpen(true)}>
        Review change
      </K.Button>
      <K.Overlay title="Review change" open={open} onClose={() => setOpen(false)}>
        <K.Text>Leave more room in the morning.</K.Text>
        <K.Input aria-label="Review note" defaultValue="Take a walk before coffee" />
        <K.Button onClick={() => setOpen(false)}>Accept change</K.Button>
      </K.Overlay>
    </K.Stack>
  );
}
function CommandContent() {
  return (
    <K.Command>
      <K.CommandInput placeholder="Find an item…" />
      <K.CommandList>
        <K.CommandEmpty>No matching items.</K.CommandEmpty>
        <K.CommandGroup heading="Items">
          <K.CommandItem>
            First item<K.CommandShortcut>↵</K.CommandShortcut>
          </K.CommandItem>
          <K.CommandItem>Second item</K.CommandItem>
        </K.CommandGroup>
        <K.CommandSeparator />
        <K.CommandGroup heading="Actions">
          <K.CommandItem>Open item</K.CommandItem>
          <K.CommandItem>Show details</K.CommandItem>
        </K.CommandGroup>
      </K.CommandList>
    </K.Command>
  );
}
function Search() {
  const [open, setOpen] = useState(false);
  return (
    <K.Stack>
      <K.SearchButton label="Choose an item" keys="⌘ K" onClick={() => setOpen(true)} />
      <K.CommandOverlay
        open={open}
        onClose={() => setOpen(false)}
        title="Choose an item"
        closeLabel="Cancel selection"
      >
        <CommandContent />
      </K.CommandOverlay>
    </K.Stack>
  );
}
function Preferences({ model, onChange }: { model?: string; onChange?: (value: string) => void }) {
  return (
    <K.SettingField label="Model" description="Used for conversations on this device.">
      <K.Select
        options={[
          { value: 'balanced', label: 'Balanced model' },
          { value: 'fast', label: 'Fast model' },
        ]}
        {...(model === undefined
          ? { defaultValue: 'balanced' }
          : { value: model, onChange: (event) => onChange?.(event.currentTarget.value) })}
      />
    </K.SettingField>
  );
}
function Settings() {
  const [open, setOpen] = useState(false);
  const [model, setModel] = useState('balanced');
  return (
    <K.Stack>
      <K.Button variant="outline" onClick={() => setOpen(true)}>
        Open settings
      </K.Button>
      <K.SettingsMenu
        open={open}
        onClose={() => setOpen(false)}
        features={[{ name: 'Agent', content: <Preferences model={model} onChange={setModel} /> }]}
      >
        <K.SettingsSection title="Appearance">
          <K.SettingField label="Theme" description="Choose how Vaulter looks.">
            <K.ThemeSwitch />
          </K.SettingField>
        </K.SettingsSection>
      </K.SettingsMenu>
    </K.Stack>
  );
}
function ExpandableRows() {
  const [expanded, setExpanded] = useState(false);
  const [action, setAction] = useState('');
  return (
    <K.FeaturePage
      title="Saved items"
      description="Shared rows with caller-owned details and actions."
    >
      <K.Stack gap="lg">
        <K.ExpandableRow
          title="Leave space for slow mornings"
          metadata={
            <K.Text size="xs" tone="muted">
              Today at 09:41 · Anna
            </K.Text>
          }
          expanded={expanded}
          onExpand={() => setExpanded(!expanded)}
          actions={
            <K.RowAction
              label="Restore"
              accessibleLabel="Restore slow mornings"
              icon="undo"
              onClick={() => setAction('Restore requested')}
            />
          }
        >
          <K.Text>Keep the morning free for focused work.</K.Text>
        </K.ExpandableRow>
        <K.ExpandableRow
          title="Coffee with Anna"
          metadata={
            <K.Text size="xs" tone="muted">
              Yesterday
            </K.Text>
          }
          expanded={false}
          onExpand={noop}
        />
        {!!action && <K.Text role="status">{action}</K.Text>}
      </K.Stack>
    </K.FeaturePage>
  );
}
function Agent() {
  const [draft, setDraft] = useState('');
  const [focused, setFocused] = useState(false);
  const [messages, setMessages] = useState<{ id: string; text: string }[]>([]);
  const [voice, setVoice] = useState<'idle' | 'listening' | 'ready'>('idle');
  const prefix = useRef('');
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (voice !== 'listening') return;
    const words = 'Leave space for slow mornings.'.split(' ');
    let count = 0;
    const timer = setInterval(() => {
      count++;
      setDraft([prefix.current, words.slice(0, count).join(' ')].filter(Boolean).join(' '));
      if (count === words.length) clearInterval(timer);
    }, 280);
    return () => clearInterval(timer);
  }, [voice]);
  const send = (text: string) => {
    if (text.trim() && voice !== 'listening') {
      setMessages([...messages, { id: crypto.randomUUID(), text: text.trim() }]);
      setDraft('');
      setVoice('idle');
    }
  };
  const voiceAction = () => {
    if (voice === 'listening') setVoice('ready');
    else {
      prefix.current = draft;
      setVoice('listening');
    }
  };
  const [chats, setChats] = useState(false);
  return (
    <>
      <K.Overlay open={chats} onClose={() => setChats(false)} title="Conversations">
        <K.SupportingPane
          title="Supporting sample"
          open={false}
          onClose={() => undefined}
          onVisible={() => undefined}
        >
          <K.Text>Supporting sample</K.Text>
        </K.SupportingPane>
        <K.SplitView
          main={<K.Text>Main content</K.Text>}
          supporting={
            <K.SupportingPane
              title="Supporting content"
              open={true}
              onClose={() => undefined}
              persistent={true}
            >
              <K.Text>Always visible</K.Text>
            </K.SupportingPane>
          }
        />
        <K.SelectionGroupHeading>Recent</K.SelectionGroupHeading>
        <K.SelectionRow selected={true} onSelect={() => undefined}>
          <K.Text>Selected row</K.Text>
        </K.SelectionRow>
        <K.SelectionList
          items={[
            { id: 'studio', title: 'Studio mornings', meta: '10 Oct, 21:40', current: true },
            { id: 'trip', title: 'Planning the coast trip', meta: '3 Oct, 18:05' },
          ]}
          onSelect={() => setChats(false)}
        />
      </K.Overlay>
      <K.ReadingColumn page={true} label="Feed sample">
        <K.Toolbar>
          <K.Heading level={2}>Feed &amp; composer</K.Heading>
          <K.Row>
            <K.Button aria-label="Conversations" onClick={() => setChats(true)}>
              Items
            </K.Button>
            <K.Button
              aria-label="New conversation"
              onClick={() => {
                setMessages([]);
                setVoice('idle');
                setDraft('');
              }}
            >
              Clear
            </K.Button>
          </K.Row>
        </K.Toolbar>
        <K.AutoScrollArea empty={!messages.length}>
          {messages.length ? (
            messages.map((message) => (
              <K.Stack key={message.id}>
                <K.Message label="Author" side="end" marker="user">
                  {message.text}
                </K.Message>
                <K.Message label="Response">
                  <K.Markdown>
                    <p>A small routine could help: a walk, coffee, and one thought written down.</p>
                  </K.Markdown>
                </K.Message>
              </K.Stack>
            ))
          ) : (
            <K.Stack>
              <K.Heading level={1}>Start a thought</K.Heading>
              <K.Text>A feed with an anchored entry field.</K.Text>
            </K.Stack>
          )}
        </K.AutoScrollArea>
        <K.Dock status={<K.VoiceStatus phase={voice} error="" />}>
          <K.Stack gap="sm">
            {!(focused || draft || messages.length || voice === 'listening') && (
              <K.PromptSuggestions
                suggestions={['Make room for slow mornings', 'What have I noticed this week?'].map(
                  (text) => ({ value: text, label: text }),
                )}
                onSelect={(text) => {
                  setDraft(text);
                  requestAnimationFrame(() => fieldRef.current?.focus());
                }}
              />
            )}

            <K.TextBox
              draft={draft}
              onDraftChange={(text) => {
                setVoice('idle');
                setDraft(text);
              }}
              onSubmit={send}
              label="Message"
              placeholder="Message…"
              canSubmit={voice !== 'listening'}
              readOnly={voice === 'listening'}
              voice={{ phase: voice, onClick: voiceAction }}
              fieldRef={fieldRef}
              onFocusChange={setFocused}
            />
          </K.Stack>
        </K.Dock>
      </K.ReadingColumn>
    </>
  );
}
function TextBoxes() {
  const [note, setNote] = useState('');
  const noteField = useRef<HTMLTextAreaElement>(null);
  const [answer, setAnswer] = useState('');
  const [instructions, setInstructions] = useState('Use concise answers.');
  const [saved, setSaved] = useState('');
  return (
    <K.NavigationSuite
      status="Local sample"
      search={{ label: 'Search', onSelect: noop }}
      destinations={[{ label: 'Text entry', href: '#text-box', icon: 'edit', current: true }]}
      actions={[]}
    >
      <K.FeaturePage
        title="Text entry"
        description="One field for short notes and considered answers."
      >
        <K.Stack gap="lg">
          <K.Stack gap="sm">
            <K.PromptSuggestions
              label="Suggested starting points"
              suggestions={[
                { value: 'Leave space for a walk before work.', label: 'Make time for a walk' },
                {
                  value: 'Keep a morning free for the studio.',
                  label: 'Keep a morning free for making things in the garden studio',
                },
              ]}
              selected={note}
              onSelect={(text) => {
                setNote(text);
                requestAnimationFrame(() => noteField.current?.focus());
              }}
            />
            <K.TextBox
              label="Quick note"
              fieldRef={noteField}
              draft={note}
              onDraftChange={setNote}
              placeholder="Write a quick note…"
              canSubmit={true}
              onSubmit={(text) => {
                setSaved(text.trim());
                setNote('');
              }}
            />
          </K.Stack>
          <K.TextBox
            label="Long answer"
            layout="longform"
            description="Enter saves. Shift+Enter adds a new line."
            placeholder="Take room for a longer answer…"
            draft={answer}
            onDraftChange={setAnswer}
            canSubmit={true}
            submitLabel="Save answer"
            onSubmit={(text) => {
              setSaved(text.trim());
              setAnswer('');
            }}
          />
          <K.TextBox
            label="Instructions"
            layout="longform"
            description="Edits take effect immediately in this sample."
            draft={instructions}
            onDraftChange={setInstructions}
          />
          <K.Text role="status">{saved ? `Saved: ${saved}` : 'Nothing saved yet.'}</K.Text>
        </K.Stack>
      </K.FeaturePage>
    </K.NavigationSuite>
  );
}

function AgentPanel() {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [messages, setMessages] = useState<{ id: string; text: string }[]>([]);
  return (
    <K.Stack>
      <K.Button variant="outline" onClick={() => setOpen(true)}>
        Open agent panel
      </K.Button>
      <K.SupportingPane
        title="Supporting task"
        open={open}
        onClose={() => setOpen(false)}
        empty={!messages.length}
        actions={
          <K.Button
            onClick={() => {
              setMessages([]);
              setDraft('');
            }}
          >
            Clear
          </K.Button>
        }
        dock={
          <K.TextBox
            draft={draft}
            onDraftChange={setDraft}
            onSubmit={(text) => {
              if (!text.trim()) return;
              setMessages([...messages, { id: crypto.randomUUID(), text: text.trim() }]);
              setDraft('');
            }}
            label="Panel message"
            submitLabel="Send panel message"
            canSubmit={true}
          />
        }
      >
        {messages.length ? (
          messages.map((message) => (
            <K.Message key={message.id} label="Author" side="end" marker="user">
              {message.text}
            </K.Message>
          ))
        ) : (
          <K.Stack>
            <K.Heading level={2}>A thought for later?</K.Heading>
            <K.Text>Keep the page open while you enter text.</K.Text>
          </K.Stack>
        )}
      </K.SupportingPane>
    </K.Stack>
  );
}

function Voice() {
  const [listChoice, setListChoice] = useState('');
  const [inlineChoice, setInlineChoice] = useState('');
  const answers = [
    { label: 'Keep this thought', id: 'keep' },
    { label: 'Explore a little more', id: 'explore' },
  ];
  return (
    <K.Stack>
      <K.Row>
        <K.VoiceButton phase="idle" busy={false} onClick={noop} />
        <K.VoiceButton phase="listening" busy={false} onClick={noop} />
        <K.VoiceButton phase="idle" busy={true} onClick={noop} />
      </K.Row>
      <K.Text size="sm" tone="muted">
        Scripted sample · no microphone access
      </K.Text>
      <K.Row>
        <K.SendButton />
        <K.SendButton focused={true} />
        <K.SendButton busy={true} onStop={noop} />
      </K.Row>
      <K.VoiceStatus phase="listening" error="" />
      <K.VoiceStatus phase="connecting" error="" />
      <K.VoiceStatus phase="finishing" error="" />
      <K.VoiceStatus phase="ready" error="" />
      <K.VoiceStatus
        phase="error"
        error="The microphone disconnected. Your text remains in the message field."
      />
      <K.Text>Question answers</K.Text>
      <K.Choices choices={answers} suggested="keep" onChoose={(_, id) => setListChoice(id)} />
      <K.Text>List answer: {listChoice || 'none'}</K.Text>
      <K.Text>Inline answers</K.Text>
      <K.Choices
        choices={answers}
        layout="inline"
        suggested="explore"
        onChoose={(_, id) => setInlineChoice(id)}
      />
      <K.Text>Inline answer: {inlineChoice || 'none'}</K.Text>
    </K.Stack>
  );
}
function Navigation() {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [settings, setSettings] = useState(false);
  const [history, setHistory] = useState(false);
  const [search, setSearch] = useState(false);
  const [current, setCurrent] = useState('Agent');
  const [multiple, setMultiple] = useState(false);
  const [selectedKinds, setSelectedKinds] = useState(['notes', 'sources']);
  const [actionCount, setActionCount] = useState(0);
  return (
    <K.NavigationSuite
      status={
        <K.Text size="xs" tone="muted">
          Synced just now
        </K.Text>
      }
      search={{ label: 'Search your vault', keys: '⌘ K', onSelect: () => setSearch(true) }}
      destinations={['Agent', 'Wiki'].map((label) => ({
        label,
        href: `#${label.toLowerCase()}`,
        icon: label === 'Agent' ? 'sparkles' : 'book',
        current: label === current,
      }))}
      actions={[
        {
          label: 'History',
          icon: 'history',
          placement: 'status',
          expanded: history,
          onSelect: () => setHistory(true),
        },
        { label: 'Settings', icon: 'settings', onSelect: () => setSettings(true) },
      ]}
    >
      <K.FeaturePage title={current} description="Shared navigation and feature content.">
        <K.Stack>
          <K.Text>The sidebar becomes a freestanding edge rail with an inward Modules menu.</K.Text>
          <K.PageControls
            actions={
              <K.Row>
                <K.Button
                  iconOnly={true}
                  aria-label="Add sample item"
                  onClick={() => setActionCount((count) => count + 1)}
                >
                  <K.Icon name="plus" />
                </K.Button>
              </K.Row>
            }
            search={{
              label: 'Find sample items',
              placeholder: 'Find an item…',
              value: query,
              onValueChange: setQuery,
            }}
            filters={
              multiple
                ? {
                    type: 'multiple',
                    label: 'Sample kinds',
                    value: selectedKinds,
                    options: [
                      { value: 'notes', label: 'Notes' },
                      { value: 'sources', label: 'Sources' },
                    ],
                    active: selectedKinds.length !== 2,
                    onValueChange: setSelectedKinds,
                  }
                : {
                    type: 'single',
                    label: 'Sample status',
                    value: filter,
                    options: [
                      { value: 'all', label: 'All' },
                      { value: 'open', label: 'Open' },
                    ],
                    onValueChange: setFilter,
                    active: filter !== 'all',
                  }
            }
          />
          <K.PageControls
            actions={
              <K.Row>
                <K.Button
                  iconOnly={true}
                  aria-label="Reset sample count"
                  onClick={() => setActionCount(0)}
                >
                  <K.Icon name="undo" />
                </K.Button>
              </K.Row>
            }
          />
          <K.Text>Sample actions: {actionCount}</K.Text>
          <K.Text>Selected kinds: {selectedKinds.join(', ') || 'none'}</K.Text>
          <K.Button onClick={() => setMultiple(!multiple)}>
            {multiple ? 'Use single filter' : 'Use multiple filters'}
          </K.Button>
          <K.Button
            variant="outline"
            onClick={() => setCurrent(current === 'Agent' ? 'Wiki' : 'Agent')}
          >
            Switch sample feature
          </K.Button>
        </K.Stack>
      </K.FeaturePage>
      <K.Drawer
        open={history}
        onClose={() => setHistory(false)}
        title="History"
        description="Recorded changes"
      >
        <K.Surface variant="preferences">
          <ExpandableRows />
        </K.Surface>
      </K.Drawer>
      <K.SettingsMenu
        open={settings}
        onClose={() => setSettings(false)}
        features={[{ name: 'Agent', content: <Preferences /> }]}
      />
      <K.CommandOverlay
        open={search}
        onClose={() => setSearch(false)}
        title="Choose an item"
        closeLabel="Cancel selection"
      >
        <CommandContent />
      </K.CommandOverlay>
    </K.NavigationSuite>
  );
}
function Frames() {
  const [open, setOpen] = useState(false);
  const status = (
    <K.Text size="xs" tone="muted">
      Synced just now
    </K.Text>
  );
  const bar = (
    <K.MobileBar
      left={
        <K.MobileActionButton
          icon="list"
          label="Menu"
          expanded={open}
          onClick={() => setOpen(true)}
        />
      }
      center={<K.MobileActionButton icon="search" label="Search" />}
      right={<K.MobileActionButton icon="settings" label="Settings" />}
      floating={<K.MobileActionButton icon="mic" label="Ask agent" primary={true} />}
    />
  );
  return (
    <K.WorkspaceFrame bar={bar}>
      <K.Page>
        <K.Brand status={status} />
        <K.Text>A shared workspace frame.</K.Text>
      </K.Page>
      <K.NavigationSheet
        open={open}
        onClose={() => setOpen(false)}
        brand={<K.Brand status={status} />}
        entries={[{ href: '#agent', label: 'Agent', icon: 'sparkles', active: true }]}
      />
    </K.WorkspaceFrame>
  );
}
function SidebarParts() {
  return (
    <K.SidebarProvider>
      <K.Sidebar>
        <K.SidebarHeader>
          <K.Brand />
        </K.SidebarHeader>
        <K.SidebarContent>
          <K.SidebarGroup>
            <K.SidebarGroupLabel>Features</K.SidebarGroupLabel>
            <K.SidebarGroupAction aria-label="Add feature">
              <K.Icon name="plus" />
            </K.SidebarGroupAction>
            <K.SidebarGroupContent>
              <K.SidebarMenu>
                <K.SidebarMenuItem>
                  <K.SidebarMenuButton isActive={true}>
                    <K.Icon name="sparkles" />
                    Agent
                  </K.SidebarMenuButton>
                  <K.SidebarMenuAction aria-label="Agent options">
                    <K.Icon name="more" />
                  </K.SidebarMenuAction>
                  <K.SidebarMenuBadge>2</K.SidebarMenuBadge>
                  <K.SidebarMenuSub>
                    <K.SidebarMenuSubItem>
                      <K.SidebarMenuSubButton>Recent conversation</K.SidebarMenuSubButton>
                    </K.SidebarMenuSubItem>
                  </K.SidebarMenuSub>
                </K.SidebarMenuItem>
                <K.SidebarMenuItem>
                  <K.SidebarMenuSkeleton />
                </K.SidebarMenuItem>
                <K.SidebarMenuItem>
                  <K.SidebarMenuSkeleton showIcon={true} />
                </K.SidebarMenuItem>
              </K.SidebarMenu>
            </K.SidebarGroupContent>
          </K.SidebarGroup>
        </K.SidebarContent>
        <K.SidebarSeparator />
        <K.SidebarFooter>
          <K.Text size="xs">This device</K.Text>
        </K.SidebarFooter>
      </K.Sidebar>
      <K.SidebarInset>
        <K.Stack inset="md" block="md">
          <K.Text>Page content</K.Text>
        </K.Stack>
      </K.SidebarInset>
    </K.SidebarProvider>
  );
}
function Access() {
  const id = useId();
  return (
    <K.Gate>
      <K.Brand />
      <K.Card>
        <K.CardHeader>
          <K.CardTitle>Open your vault</K.CardTitle>
          <K.CardDescription>This device remembers it.</K.CardDescription>
        </K.CardHeader>
        <K.CardContent>
          <K.Form onSubmit={(event) => event.preventDefault()}>
            <K.Stack>
              <K.Label htmlFor={id}>Password</K.Label>
              <K.InputGroup>
                <K.InputGroupInput id={id} type="password" autoComplete="off" />
                <K.InputGroupAddon align="inset-end">
                  <K.InputGroupButton
                    variant="filled"
                    type="submit"
                    size="standard"
                    iconOnly={true}
                    aria-label="Open vault"
                  >
                    <K.Icon name="enter" />
                  </K.InputGroupButton>
                </K.InputGroupAddon>
              </K.InputGroup>
            </K.Stack>
          </K.Form>
        </K.CardContent>
      </K.Card>
    </K.Gate>
  );
}
// Existing page/input presentation illustrates registration, without a new product design.
function PreviewSummary({ title }: { title: string }) {
  return (
    <K.FeaturePage title={title}>
      <K.Input aria-label="Preview draft" placeholder="Keep a draft while switching layouts…" />
      <K.PreviewBar label="Notice primitive" kitHref="#navigation" onReset={noop} />
    </K.FeaturePage>
  );
}
function Preview() {
  return (
    <K.DesignComparison
      alternatives={[
        { id: 'note', label: 'Note summary', content: <PreviewSummary title="Note summary" /> },
        {
          id: 'question',
          label: 'Question summary',
          content: <PreviewSummary title="Question summary" />,
        },
      ]}
      preview={(controls, content) => (
        <K.DesignPreview
          label="Design preview · sample data"
          kitHref="#navigation"
          onReset={noop}
          variantControls={controls}
        >
          <K.NavigationSuite
            status="Synced"
            search={{ label: 'Search', onSelect: noop }}
            destinations={[{ label: 'Agent', href: '#agent', icon: 'sparkles', current: true }]}
            actions={[{ label: 'Settings', icon: 'settings', onSelect: noop }]}
          >
            {content}
          </K.NavigationSuite>
        </K.DesignPreview>
      )}
    />
  );
}
function Icons() {
  return (
    <K.Row wrap={true}>
      {K.iconNames.map((name) => (
        <K.Stack key={name} align="center" gap="xs">
          <K.Icon name={name} size="lg" />
          <K.Text size="xs" tone="muted">
            {name}
          </K.Text>
        </K.Stack>
      ))}
    </K.Row>
  );
}
function Scrolling() {
  return (
    <K.ScrollArea>
      <K.Stack>
        {Array.from({ length: 30 }, (_, i) => `Note ${i + 1}`).map((note) => (
          <K.Text key={note}>{note} · a thought for later</K.Text>
        ))}
      </K.Stack>
    </K.ScrollArea>
  );
}

function SurfacePrimitives() {
  return (
    <K.ReadingColumn>
      <K.Toolbar>
        <K.Heading>Shared toolbar</K.Heading>
        <K.Button variant="ghost" size="standard" iconOnly={true} aria-label="Close example">
          <K.Icon name="close" />
        </K.Button>
      </K.Toolbar>
      <K.AutoScrollArea>
        <K.Stack>
          <K.Surface variant="grouped">
            <K.Surface variant="groupHeading">
              <K.Heading>Grouped section</K.Heading>
            </K.Surface>
            <K.Surface variant="inset">
              <K.Text>Inset content</K.Text>
            </K.Surface>
          </K.Surface>
          <K.Surface variant="bubble">A message-sized surface</K.Surface>
          <K.Surface variant="subtle">
            <K.Text>A gently framed group of related controls.</K.Text>
          </K.Surface>
          <K.Surface variant="emblem">
            <K.Icon name="sparkles" />
          </K.Surface>
          <K.Surface variant="preferences">
            <K.Text>Preference surface</K.Text>
          </K.Surface>
        </K.Stack>
      </K.AutoScrollArea>
      <K.Dock>
        <K.Surface variant="plain">
          <K.Form layout="inline" onSubmit={(event) => event.preventDefault()}>
            <K.InputGroup variant="composer">
              <K.InputGroupTextarea
                variant="inline"
                rows={1}
                aria-label="Inline primitive field"
                placeholder="One-row field…"
              />
              <K.InputGroupAddon align="inset-end">
                <K.Button type="submit" size="standard" iconOnly={true} aria-label="Submit example">
                  <K.Icon name="arrow-up" />
                </K.Button>
              </K.InputGroupAddon>
            </K.InputGroup>
          </K.Form>
        </K.Surface>
      </K.Dock>
    </K.ReadingColumn>
  );
}
function PanelPrimitive() {
  const [open, setOpen] = useState(false);
  const [menu, setMenu] = useState(false);
  const [review, setReview] = useState(false);
  const [details, setDetails] = useState(false);
  return (
    <K.Stack>
      <K.Button variant="outline" onClick={() => setMenu(true)}>
        Open menu surface
      </K.Button>
      <K.Drawer open={menu} onClose={() => setMenu(false)} title="Shared menu">
        <K.Text>Navigation and Settings share this surface.</K.Text>
      </K.Drawer>
      <K.Button onClick={() => setOpen(true)}>Open adaptive panel</K.Button>
      <K.SupportingPane title="Supporting content" open={open} onClose={() => setOpen(false)}>
        <K.Toolbar>
          <K.Heading>Supporting content</K.Heading>
          <K.Button
            variant="ghost"
            size="standard"
            iconOnly={true}
            aria-label="Close supporting content"
            onClick={() => setOpen(false)}
          >
            <K.Icon name="close" />
          </K.Button>
        </K.Toolbar>
        <K.Textarea aria-label="Supporting draft" defaultValue="Same content through a resize" />
        <K.Button onClick={() => setReview(true)}>Review supporting draft</K.Button>
        <K.Button onClick={() => setDetails(true)}>Open supporting details</K.Button>
        <K.Overlay title="Supporting review" open={review} onClose={() => setReview(false)}>
          <K.Input aria-label="Review draft" defaultValue="Review the supporting task" />
        </K.Overlay>
        <K.Drawer title="Supporting details" open={details} onClose={() => setDetails(false)}>
          <K.Input aria-label="Details draft" defaultValue="Details for the supporting task" />
        </K.Drawer>
      </K.SupportingPane>
    </K.Stack>
  );
}
function SupportingPaneSample() {
  const [open, setOpen] = useState(false);
  const [review, setReview] = useState(false);
  const [feed, setFeed] = useState(false);
  const [draft, setDraft] = useState('');
  const [messages, setMessages] = useState([
    { id: 'retained', text: 'A retained supporting message.' },
  ]);
  return (
    <K.SplitView
      main={
        <K.Stack>
          <K.Button onClick={() => setOpen(true)}>Open supporting pane</K.Button>
          <K.Button variant="outline" onClick={() => setFeed(!feed)}>
            {feed ? 'Use scrolling body' : 'Use anchored feed'}
          </K.Button>
          <K.Input aria-label="Main task draft" defaultValue="Independent main task" />
        </K.Stack>
      }
      supporting={
        <K.SupportingPane
          title="Supporting task"
          open={open}
          onClose={() => setOpen(false)}
          actions={
            <K.Button variant="ghost" onClick={() => setReview(true)}>
              Review
            </K.Button>
          }
          dock={
            feed ? (
              <K.TextBox
                draft={draft}
                onDraftChange={setDraft}
                canSubmit={true}
                onSubmit={(text) => {
                  setMessages([...messages, { id: crypto.randomUUID(), text }]);
                  setDraft('');
                }}
                label="Supporting message"
                placeholder="Continue the supporting task"
              />
            ) : undefined
          }
        >
          <K.Overlay title="Supporting review" open={review} onClose={() => setReview(false)}>
            <K.Input aria-label="Supporting review draft" defaultValue="Retained review" />
          </K.Overlay>
          {feed ? (
            messages.map((message) => <K.Text key={message.id}>{message.text}</K.Text>)
          ) : (
            <K.Stack>
              <K.Textarea
                aria-label="Supporting draft"
                defaultValue="Retained supporting content"
              />
              {Array.from({ length: 24 }, (_, index) => `Supporting line ${index + 1}`).map(
                (line) => (
                  <K.Text key={line}>{line}</K.Text>
                ),
              )}
            </K.Stack>
          )}
        </K.SupportingPane>
      }
    />
  );
}

function OptionPrimitives() {
  return (
    <K.Stack>
      <K.OptionStrip>
        {[
          'An option with a little more detail',
          'Another option to explore',
          'Something to keep for later',
        ].map((option) => (
          <K.Button key={option} variant="outline">
            {option}
          </K.Button>
        ))}
      </K.OptionStrip>
    </K.Stack>
  );
}
function FollowingPrimitive() {
  const [count, setCount] = useState(30);
  return (
    <K.Stack fill={true}>
      <K.Button onClick={() => setCount(count + 1)}>Append item</K.Button>
      <K.AutoScrollArea>
        {Array.from({ length: count }, (_, i) => `Item ${i + 1}`).map((item) => (
          <K.Text key={item}>{item} · followed to the end</K.Text>
        ))}
      </K.AutoScrollArea>
    </K.Stack>
  );
}

function Passages() {
  const text = `${'Earlier plans. '.repeat(40)}Keep mornings free.${' Later details.'.repeat(40)}`;
  return (
    <K.Stack>
      <K.PassageCard
        label="Retained passage"
        title={
          <K.Link href="#planning-note" plain={true}>
            Planning note
          </K.Link>
        }
        text={text}
        selection={{ start: 600, end: 619 }}
        attribution={
          <K.Text size="xs" tone="muted">
            Fictional owner
          </K.Text>
        }
        disclosureLabel="Context from Planning note"
        notice={
          <K.Text size="xs" tone="muted">
            Recorded context remains available.
          </K.Text>
        }
      />
      <K.PassageCard
        label="Empty passage"
        title="Uncaptured note"
        text=""
        disclosureLabel="Context from Uncaptured note"
        empty="No retained passage"
      />
    </K.Stack>
  );
}

function BoundedPresentation() {
  return (
    <K.PresentationPreview device="mobile" height={320}>
      <K.FeaturePage title="Bounded presentation">
        <K.Text>Supplied content uses the shared bounds and portal policy.</K.Text>
      </K.FeaturePage>
    </K.PresentationPreview>
  );
}

function Chronology() {
  const [selected, setSelected] = useState<string>();
  return (
    <K.Stack gap="xl">
      <K.MonthCalendar
        label="October 2026"
        offset={3}
        selected={selected}
        onSelect={setSelected}
        days={Array.from({ length: 31 }, (_, index) => ({
          date: `2026-10-${String(index + 1).padStart(2, '0')}`,
          label: `${index + 1} October 2026`,
          number: index + 1,
          items: index === 16 ? [{ id: 'walk', title: 'A walk in the garden' }] : [],
        }))}
      />
      <K.Timeline
        label="A little history"
        items={[
          {
            id: 'first',
            date: 'Around June 2026',
            title: 'The first idea',
            metadata: 'Approximate',
            description: 'A place for making things.',
          },
          {
            id: 'second',
            date: '17 October 2026',
            title: 'A walk in the garden',
            metadata: 'Planned',
            details: 'Bring a notebook.',
          },
        ]}
      />
    </K.Stack>
  );
}

export const catalogue: Specimen[] = [
  {
    id: 'chronology',
    title: 'Calendar & timeline',
    description: 'Controlled month selection and an embeddable chronology.',
    components: ['MonthCalendar', 'Timeline'],
    Sample: Chronology,
  },
  {
    id: 'text-box',
    title: 'Text box',
    description:
      'Compact submission, longer answers and immediate edits share the same text entry.',
    components: ['TextBox', 'PromptSuggestions'],
    Sample: TextBoxes,
    fullBleed: true,
  },
  {
    id: 'passages',
    title: 'Passage disclosure',
    description:
      'Retained text with supplied marks, bounded context and independent keyboard disclosure.',
    components: ['PassageCard'],
    Sample: Passages,
  },

  {
    id: 'bounded-presentation',
    title: 'Bounded presentation',
    description: 'A supplied device canvas shares browser focus and portal mechanics.',
    components: ['PresentationPreview'],
    Sample: BoundedPresentation,
  },
  {
    id: 'navigation',
    title: 'Navigation & workspace',
    description: 'One feature list: sidebar on desktop, footer and menu drawer on phone.',
    components: ['NavigationSuite', 'FeaturePage', 'PageControls'],
    Sample: Navigation,
    fullBleed: true,
  },
  {
    id: 'agent',
    title: 'Feed & composer',
    description: 'The same feed, suggestions, message field and voice actions rearrange together.',
    components: [
      'SelectionList',
      'SelectionRow',
      'SelectionGroupHeading',
      'SplitView',
      'Message',
      'Markdown',
      'TextBox',
      'SendButton',
      'PromptSuggestions',
    ],
    Sample: Agent,
    fullBleed: true,
  },
  {
    id: 'settings',
    title: 'Settings',
    description:
      'Feature-owned text and choice fields with shared association: desktop dialog and phone drawer.',
    components: [
      'SettingsMenu',
      'SettingsSection',
      'SettingField',
      'ThemeSwitch',
      'RadioGroup',
      'Select',
    ],
    Sample: Settings,
  },
  {
    id: 'search',
    title: 'Search & commands',
    description: 'Full-screen phone search and the desktop command palette.',
    components: [
      'CommandOverlay',
      'SearchButton',
      'Command',
      'CommandInput',
      'CommandList',
      'CommandEmpty',
      'CommandGroup',
      'CommandItem',
      'CommandShortcut',
      'CommandSeparator',
    ],
    Sample: Search,
  },
  {
    id: 'expandable-rows',
    title: 'Expandable rows',
    description: 'Shared titled rows with caller-owned metadata, details and actions.',
    components: ['ExpandableRow', 'RowAction'],
    Sample: ExpandableRows,
    fullBleed: true,
  },
  {
    id: 'voice',
    title: 'Voice & choices',
    description:
      'Microphone controls, compact status and error messages; speech fills the Agent message field.',
    components: ['VoiceButton', 'VoiceStatus', 'Choices'],
    Sample: Voice,
  },
  {
    id: 'agent-panel',
    title: 'Supporting feed',
    description: 'Shared pane with a following feed and an anchored entry field.',
    components: ['SupportingPane'],
    Sample: AgentPanel,
  },
  {
    id: 'review',
    title: 'Review overlay',
    description: 'A shared dialog tree, centered on desktop and bottom-aligned on phone.',
    components: ['Overlay'],
    Sample: Review,
  },
  {
    id: 'surface-primitives',
    title: 'Surface & layout primitives',
    description:
      'Building blocks used by Agent and Settings: toolbar, reading column, dock and surface roles.',
    components: ['Surface', 'Toolbar', 'ReadingColumn', 'Dock'],
    Sample: SurfacePrimitives,
    fullBleed: true,
  },
  {
    id: 'supporting-pane',
    title: 'Supporting pane',
    description:
      'One header, width and scrolling policy beside expanded content and in a full-height compact bottom Drawer; optional following feed and anchored composer.',
    components: ['SupportingPane'],
    Sample: SupportingPaneSample,
    fullBleed: true,
  },
  {
    id: 'panel-primitive',
    title: 'Adaptive panel primitive',
    description:
      'Supporting content beside the page on wide screens and in shared modal/Drawer presentation when narrower; drafts and nested tasks stay mounted.',
    components: ['SupportingPane', 'Drawer'],
    Sample: PanelPrimitive,
  },
  {
    id: 'option-primitives',
    title: 'Option strip primitive',
    description: 'One unwrapped scrolling row with a fade at each clipped edge.',
    components: ['OptionStrip'],
    Sample: OptionPrimitives,
  },
  {
    id: 'following-primitive',
    title: 'Following scroll primitive',
    description: 'Append content, scroll back, then use Latest reply to resume following.',
    components: ['AutoScrollArea'],
    Sample: FollowingPrimitive,
  },
  {
    id: 'typography',
    title: 'Type & spacing',
    description: 'Shared roles for titles, copy, links, rows and stacks.',
    components: ['Heading', 'Text', 'Prose', 'Link', 'Stack', 'Row', 'Spacer', 'Kbd', 'KeyHint'],
    Sample: Typography,
  },
  {
    id: 'buttons',
    title: 'Buttons & selection',
    description: 'Mouse density beside the same controls with 44px touch targets.',
    components: [
      'Button',
      'ToggleGroup',
      'ToggleGroupItem',
      'TooltipProvider',
      'Tooltip',
      'TooltipTrigger',
      'TooltipContent',
    ],
    Sample: Buttons,
  },
  {
    id: 'status',
    title: 'Status & feedback',
    description: 'Tones, alerts, activity feedback and notifications.',
    components: [
      'Badge',
      'Chip',
      'Dot',
      'Count',
      'Notice',
      'Alert',
      'AlertTitle',
      'AlertDescription',
      'Activity',
      'LoadingStatus',
      'Loader',
      'Separator',
      'Toaster',
    ],
    Sample: Status,
  },
  {
    id: 'fields',
    title: 'Forms & fields',
    description: 'Labels, descriptions, validation, keyboard submission and selection.',
    components: [
      'RadioGroup',
      'RadioGroupItem',
      'RadioGroupIndicator',
      'Form',
      'FieldSet',
      'FieldLegend',
      'FieldGroup',
      'Field',
      'FieldLabel',
      'FieldContent',
      'FieldTitle',
      'FieldDescription',
      'FieldSeparator',
      'FieldError',
      'Input',
      'Label',
      'Textarea',
      'Checkbox',
    ],
    Sample: Fields,
  },
  {
    id: 'grouped-fields',
    title: 'Grouped inputs',
    description: 'Trailing actions and leading context inside a shared field.',
    components: [
      'InputGroup',
      'InputGroupAddon',
      'InputGroupButton',
      'InputGroupInput',
      'InputGroupTextarea',
      'InputGroupText',
    ],
    Sample: GroupedFields,
  },
  {
    id: 'cards',
    title: 'Cards',
    description: 'One card with title, description, action, content and footer.',
    components: [
      'Card',
      'CardHeader',
      'CardFooter',
      'CardTitle',
      'CardAction',
      'CardDescription',
      'CardContent',
    ],
    Sample: Cards,
  },
  {
    id: 'items',
    title: 'Items & people',
    description:
      'Plain and current rows with context, actions, framed icons, supplied thumbnails and category initials.',
    components: [
      'Item',
      'ItemGroup',
      'ItemMedia',
      'ItemContent',
      'ItemActions',
      'ItemSeparator',
      'ItemTitle',
      'ItemDescription',
      'ItemHeader',
      'ItemFooter',
      'Avatar',
    ],
    Sample: Items,
  },
  {
    id: 'empty',
    title: 'Empty state',
    description: 'An empty screen with an explanation and a next action.',
    components: [
      'Empty',
      'EmptyHeader',
      'EmptyTitle',
      'EmptyDescription',
      'EmptyContent',
      'EmptyMedia',
    ],
    Sample: EmptyStates,
  },
  {
    id: 'linked-content',
    title: 'Linked content',
    description: 'Marks, sources, details, contributions and hover previews.',
    components: [
      'Mark',
      'Cite',
      'Sources',
      'Details',
      'Panel',
      'SourceLabel',
      'List',
      'ListItem',
      'HoverPreview',
    ],
    Sample: LinkedContent,
  },
  {
    id: 'layout',
    title: 'Page & columns',
    description: 'The same content and supporting details stack in compact space.',
    components: ['Page', 'PageHeader', 'Columns'],
    Sample: Layout,
    fullBleed: true,
  },
  {
    id: 'tabs',
    title: 'Tabs',
    description: 'Rounded horizontal tabs with supplied content.',
    components: ['Tabs', 'TabsList', 'TabsTrigger', 'TabsContent'],
    Sample: TabsSample,
  },
  {
    id: 'charts',
    title: 'Charts',
    description: 'Accessible bars and sparklines with shared data.',
    components: ['Bars', 'Sparkline', 'NetworkDiagram', 'MapView'],
    Sample: Charts,
  },
  {
    id: 'changes',
    title: 'Changes & tool results',
    description:
      'Code changes, note changes and collapsible agent activity: tool calls folded into one line, and what the agent is doing now.',
    components: ['CodeDiff', 'UnifiedDiff', 'ToolResult', 'ToolGroup', 'LiveStatus', 'Json'],
    Sample: Changes,
  },
  {
    id: 'menus',
    title: 'Dropdown menus',
    description: 'Actions, checked items, radio groups and nested destinations.',
    components: [
      'DropdownMenu',
      'DropdownMenuTrigger',
      'DropdownMenuContent',
      'DropdownMenuGroup',
      'DropdownMenuLabel',
      'DropdownMenuItem',
      'DropdownMenuCheckboxItem',
      'DropdownMenuRadioGroup',
      'DropdownMenuRadioItem',
      'DropdownMenuSeparator',
      'DropdownMenuShortcut',
      'DropdownMenuSub',
      'DropdownMenuSubTrigger',
      'DropdownMenuSubContent',
    ],
    Sample: Menus,
  },
  {
    id: 'dialogs',
    title: 'Dialog & drawer',
    description: 'Adaptive overlays, supplied responsive footer actions and contained drawers.',
    components: ['DialogFooter', 'Drawer'],
    Sample: Dialogs,
  },
  {
    id: 'frames',
    title: 'Frame & mobile controls',
    description: 'Brand, status, footer fixtures, floating action and feature drawer.',
    components: ['WorkspaceFrame', 'Brand', 'MobileBar', 'MobileActionButton', 'NavigationSheet'],
    Sample: Frames,
    fullBleed: true,
  },
  {
    id: 'sidebar',
    title: 'Sidebar primitives',
    description: 'Groups, rows, nested items, actions and loading states.',
    components: [
      'Sidebar',
      'SidebarMenu',
      'SidebarContent',
      'SidebarFooter',
      'SidebarGroup',
      'SidebarGroupAction',
      'SidebarGroupContent',
      'SidebarGroupLabel',
      'SidebarHeader',
      'SidebarInset',
      'SidebarMenuAction',
      'SidebarMenuBadge',
      'SidebarMenuButton',
      'SidebarMenuItem',
      'SidebarMenuSkeleton',
      'SidebarMenuSub',
      'SidebarMenuSubButton',
      'SidebarMenuSubItem',
      'SidebarProvider',
      'SidebarSeparator',
    ],
    Sample: SidebarParts,
    fullBleed: true,
  },
  {
    id: 'access',
    title: 'Vault access',
    description: 'The shared access gate and password form.',
    components: ['Gate'],
    Sample: Access,
    fullBleed: true,
  },
  {
    id: 'preview',
    title: 'Preview notice',
    description:
      'Floating device and design controls, demonstrated with retained page/input presentation.',
    components: ['PreviewBar', 'DesignPreview', 'DesignComparison'],
    Sample: Preview,
    fullBleed: true,
  },
  {
    id: 'icons',
    title: 'Icons',
    description: 'Every icon in the shared vocabulary.',
    components: ['Icon'],
    Sample: Icons,
  },
  {
    id: 'scrolling',
    title: 'Scroll area',
    description: 'Contained scrolling for long content.',
    components: ['ScrollArea'],
    Sample: Scrolling,
  },
];
