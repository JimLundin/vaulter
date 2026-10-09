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
      <K.Text>Body copy stays readable at every size.</K.Text>
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
  return (
    <K.Stack gap="lg">
      <K.Row wrap={true}>
        <K.Button onClick={() => setCount(count + 1)}>Save note</K.Button>
        <K.Button variant="outline">Cancel</K.Button>
        <K.Button variant="secondary">Later</K.Button>
        <K.Button variant="ghost">More</K.Button>
        <K.Button variant="link">Open note</K.Button>
        <K.Button variant="destructive">Delete</K.Button>
        <K.Button disabled={true}>Unavailable</K.Button>
      </K.Row>
      <K.Row wrap={true}>
        <K.Button size="sm">Small</K.Button>
        <K.Button size="lg">Large</K.Button>
        <K.Button variant="ghost" size="square" aria-label="Square action">
          <K.Icon name="settings" />
        </K.Button>
        <K.Button variant="voice" size="voice" aria-label="Voice action">
          <K.Icon name="mic" size="xl" />
        </K.Button>
        <K.Button size="icon-sm" aria-label="Add note">
          <K.Icon name="plus" />
        </K.Button>
      </K.Row>
      <K.Text size="sm" tone="muted">
        Saved {count} times in this example.
      </K.Text>
      <K.ToggleGroup type="single" defaultValue="day" variant="outline">
        <K.ToggleGroupItem value="day">Day</K.ToggleGroupItem>
        <K.ToggleGroupItem value="week">Week</K.ToggleGroupItem>
        <K.ToggleGroupItem value="month">Month</K.ToggleGroupItem>
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
  const [toasterId] = useState(() => `kit-${crypto.randomUUID()}`);
  return (
    <K.Stack gap="lg">
      <K.Row wrap={true}>
        <K.Badge>Draft</K.Badge>
        <K.Badge variant="secondary">Saved</K.Badge>
        <K.Chip tone="people">Anna</K.Chip>
        <K.Chip tone="places">Pascal</K.Chip>
        <K.Chip tone="events">Dinner</K.Chip>
        <K.Dot tone="places" />
        <K.Count n={3} />
      </K.Row>
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
        <K.Recording seconds={23} />
      </K.Row>
      <K.Skeleton />
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
              <K.Input id={`${id}-model`} defaultValue="example-model" />
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
          <K.InputGroupButton variant="default" size="icon-sm" aria-label="Save quick note">
            <K.Icon name="arrow-up" />
          </K.InputGroupButton>
        </K.InputGroupAddon>
      </K.InputGroup>
    </K.Stack>
  );
}
function Cards() {
  return (
    <K.Card>
      <K.CardHeader>
        <K.CardTitle>Slow mornings</K.CardTitle>
        <K.CardDescription>A little room before the day begins.</K.CardDescription>
        <K.CardAction>
          <K.Button variant="ghost" size="icon" aria-label="More options">
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
  );
}
function Items() {
  return (
    <K.ItemGroup>
      <K.Item variant="outline">
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
          <K.Button variant="ghost" size="icon" aria-label="Open morning walk">
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
      <K.Columns stack={true}>
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
function ListAndDetail() {
  return (
    <K.ListDetail
      list={
        <K.Stack>
          <K.Text>Morning walk</K.Text>
          <K.Text>Quiet weekend</K.Text>
        </K.Stack>
      }
      detail={
        <K.Page>
          <K.Heading level={1} serif={true}>
            Morning walk
          </K.Heading>
          <K.Text>A few thoughts from the way home.</K.Text>
        </K.Page>
      }
    />
  );
}
function TabsSample() {
  return (
    <K.Tabs defaultValue="notes">
      <K.TabsList>
        <K.TabsTrigger value="notes">Notes</K.TabsTrigger>
        <K.TabsTrigger value="activity">Activity</K.TabsTrigger>
      </K.TabsList>
      <K.TabsContent value="notes">
        <K.Text>Your recent thoughts.</K.Text>
      </K.TabsContent>
      <K.TabsContent value="activity">
        <K.Timeline>
          <K.TimelineItem time="09:41" now={true}>
            <K.Text>Saved a note</K.Text>
          </K.TimelineItem>
          <K.TimelineItem time="08:30" last={true}>
            <K.Text>Took a walk</K.Text>
          </K.TimelineItem>
        </K.Timeline>
      </K.TabsContent>
    </K.Tabs>
  );
}
function Charts() {
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
    </K.Stack>
  );
}
function Maps() {
  const [load, setLoad] = useState(false);
  return (
    <K.Stack>
      <K.Text size="sm" tone="muted">
        Loading the map connects to OpenFreeMap for public tiles.
      </K.Text>
      {load ? (
        <K.MapView
          label="Places in your notes"
          points={[{ id: 'coffee', label: 'Coffee with Anna', at: { lat: 59.337, lon: 18.06 } }]}
        />
      ) : (
        <K.Button variant="outline" onClick={() => setLoad(true)}>
          Load map
        </K.Button>
      )}
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
  const [drawer, setDrawer] = useState(false);
  return (
    <K.Stack gap="lg">
      <K.Dialog>
        <K.DialogTrigger render={<K.Button variant="outline">Open dialog</K.Button>} />
        <K.DialogContent>
          <K.DialogHeader>
            <K.DialogTitle>Keep this note?</K.DialogTitle>
            <K.DialogDescription>You can change your mind later.</K.DialogDescription>
          </K.DialogHeader>
          <K.Input aria-label="Dialog note title" defaultValue="Slow mornings" />
          <K.DialogFooter>
            <K.DialogClose render={<K.Button>Keep note</K.Button>} />
          </K.DialogFooter>
        </K.DialogContent>
      </K.Dialog>
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
      <K.CommandInput placeholder="Find a note…" />
      <K.CommandList>
        <K.CommandEmpty>No matching notes.</K.CommandEmpty>
        <K.CommandGroup heading="Notes">
          <K.CommandItem>
            Slow mornings<K.CommandShortcut>↵</K.CommandShortcut>
          </K.CommandItem>
          <K.CommandItem>Coffee with Anna</K.CommandItem>
        </K.CommandGroup>
        <K.CommandSeparator />
        <K.CommandGroup heading="Go to">
          <K.CommandItem>History</K.CommandItem>
          <K.CommandItem>Settings</K.CommandItem>
        </K.CommandGroup>
      </K.CommandList>
    </K.Command>
  );
}
function Search() {
  const [open, setOpen] = useState(false);
  const [command, setCommand] = useState(false);
  return (
    <K.Stack>
      <K.SearchButton label="Search your vault" keys="⌘ K" onClick={() => setOpen(true)} />
      <K.SearchSurface open={open} onClose={() => setOpen(false)}>
        <CommandContent />
      </K.SearchSurface>
      <K.Button variant="outline" onClick={() => setCommand(true)}>
        Open primitive command dialog
      </K.Button>
      <K.CommandDialog open={command} onOpenChange={setCommand}>
        <CommandContent />
      </K.CommandDialog>
    </K.Stack>
  );
}
function Preferences({ model, onChange }: { model?: string; onChange?: (value: string) => void }) {
  return (
    <K.SettingField label="Model" description="Used for conversations on this device.">
      <K.Input
        {...(model === undefined
          ? { defaultValue: 'example-model' }
          : { value: model, onChange: (event) => onChange?.(event.currentTarget.value) })}
      />
    </K.SettingField>
  );
}
function Settings() {
  const [open, setOpen] = useState(false);
  const [model, setModel] = useState('example-model');
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
      <K.SettingsPage>
        <K.SettingsSection title="Agent">
          <Preferences model={model} onChange={setModel} />
        </K.SettingsSection>
      </K.SettingsPage>
    </K.Stack>
  );
}
function History() {
  const [expanded, setExpanded] = useState(false);
  return (
    <K.HistorySurface>
      <K.HistoryEntry
        title="Leave space for slow mornings"
        date="Today at 09:41"
        sha="a1b2c3d"
        expanded={expanded}
        onExpand={() => setExpanded(!expanded)}
        onRevert={noop}
      >
        <K.UnifiedDiff path="notes/slow-mornings.md" patch={patch} />
      </K.HistoryEntry>
      <K.HistoryEntry
        title="Coffee with Anna"
        date="Yesterday"
        sha="e4f5a6b"
        expanded={false}
        onExpand={noop}
      />
    </K.HistorySurface>
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
  return (
    <K.ConversationPage>
      <K.ConversationSurface
        busy={false}
        onNewChat={() => {
          setMessages([]);
          setVoice('idle');
          setDraft('');
        }}
        status={<K.VoiceStatus phase={voice} error="" />}
        composer={
          <K.Composer
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
        }
        suggestions={
          !(focused || draft || messages.length || voice === 'listening') && (
            <K.PromptSuggestions
              suggestions={['Make room for slow mornings', 'What have I noticed this week?']}
              onSelect={(text) => {
                setDraft(text);
                requestAnimationFrame(() => fieldRef.current?.focus());
              }}
            />
          )
        }
      >
        <K.ConversationFeed empty={!messages.length}>
          {messages.length ? (
            messages.map((message) => (
              <K.Stack key={message.id}>
                <K.Message user={true}>{message.text}</K.Message>
                <K.Message>
                  <K.Markdown>
                    <p>A small routine could help: a walk, coffee, and one thought written down.</p>
                  </K.Markdown>
                </K.Message>
              </K.Stack>
            ))
          ) : (
            <K.ConversationWelcome
              title="What’s on your mind?"
              description="Ask about your notes, or leave a thought for later."
            />
          )}
        </K.ConversationFeed>
      </K.ConversationSurface>
    </K.ConversationPage>
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
      <K.ConversationPanel open={open} onClose={() => setOpen(false)}>
        <K.ConversationSurface
          busy={false}
          onNewChat={() => {
            setMessages([]);
            setDraft('');
          }}
          composer={
            <K.Composer
              draft={draft}
              onDraftChange={setDraft}
              onSubmit={(text) => {
                if (!text.trim()) return;
                setMessages([...messages, { id: crypto.randomUUID(), text: text.trim() }]);
                setDraft('');
              }}
              label="Panel message"
              sendLabel="Send panel message"
              canSubmit={true}
            />
          }
        >
          <K.ConversationFeed empty={!messages.length}>
            {messages.length ? (
              messages.map((message) => (
                <K.Message key={message.id} user={true}>
                  {message.text}
                </K.Message>
              ))
            ) : (
              <K.ConversationWelcome
                title="A thought for later?"
                description="Keep the page open while you ask."
              />
            )}
          </K.ConversationFeed>
        </K.ConversationSurface>
      </K.ConversationPanel>
    </K.Stack>
  );
}
function Voice() {
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
      <K.VoiceStatus phase="ready" error="" />
      <K.VoiceStatus
        phase="error"
        error="The microphone disconnected. Your text remains in the message field."
      />
      <K.Choices
        choices={[
          { label: 'Keep this thought', id: 'keep' },
          { label: 'Explore a little more', id: 'explore' },
        ]}
        onChoose={noop}
      />
    </K.Stack>
  );
}
function Navigation() {
  const [settings, setSettings] = useState(false);
  const [search, setSearch] = useState(false);
  const [current, setCurrent] = useState('Agent');
  return (
    <K.NavigationSuite
      status={
        <K.Text size="xs" tone="muted">
          Synced just now
        </K.Text>
      }
      search={{ label: 'Search your vault', keys: '⌘ K', onSelect: () => setSearch(true) }}
      destinations={['Agent', 'History'].map((label) => ({
        label,
        href: `#${label.toLowerCase()}`,
        icon: label === 'Agent' ? 'sparkles' : 'history',
        current: label === current,
      }))}
      actions={[{ label: 'Settings', icon: 'settings', onSelect: () => setSettings(true) }]}
    >
      <K.FeaturePage title={current} description="Shared navigation and feature content.">
        <K.Stack>
          <K.Text>The sidebar becomes a footer and a menu drawer.</K.Text>
          <K.Button
            variant="outline"
            onClick={() => setCurrent(current === 'Agent' ? 'History' : 'Agent')}
          >
            Switch sample feature
          </K.Button>
        </K.Stack>
      </K.FeaturePage>
      <K.SettingsMenu
        open={settings}
        onClose={() => setSettings(false)}
        features={[{ name: 'Agent', content: <Preferences /> }]}
      />
      <K.SearchSurface open={search} onClose={() => setSearch(false)}>
        <CommandContent />
      </K.SearchSurface>
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
    <K.WorkspaceFrame header={<K.MobileHeader status={status} />} bar={bar}>
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
function LegacyFrames() {
  return (
    <K.Columns stack={true}>
      <K.DesktopMain>
        <K.Text>Desktop main frame</K.Text>
      </K.DesktopMain>
      <K.MobileFrame bar={<K.MobileBar />}>
        <K.Text>Mobile frame</K.Text>
      </K.MobileFrame>
    </K.Columns>
  );
}
function SidebarParts() {
  return (
    <K.SidebarProvider>
      <K.Sidebar collapsible="none">
        <K.SidebarHeader>
          <K.Row justify="between">
            <K.Brand />
            <K.SidebarTrigger />
          </K.Row>
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
                    variant="default"
                    type="submit"
                    size="icon-sm"
                    aria-label="Open vault"
                  >
                    <K.Icon name="chevron-right" />
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
function Preview() {
  return (
    <K.DesignPreview label="Design preview · sample data" kitHref="#navigation" onReset={noop}>
      <K.NavigationSuite
        status="Synced"
        search={{ label: 'Search', onSelect: noop }}
        destinations={[{ label: 'Agent', href: '#agent', icon: 'sparkles', current: true }]}
        actions={[{ label: 'Settings', icon: 'settings', onSelect: noop }]}
      >
        <K.FeaturePage title="Live preview">
          <K.Input aria-label="Preview draft" placeholder="Keep a draft while switching layouts…" />
          <K.PreviewBar label="Notice primitive" kitHref="#navigation" onReset={noop} />
        </K.FeaturePage>
      </K.NavigationSuite>
    </K.DesignPreview>
  );
}
function SidePanels() {
  return (
    <K.SidePanel title="Note details" onClose={noop}>
      <K.Text>A supporting panel.</K.Text>
    </K.SidePanel>
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
        <K.Button variant="ghost" size="icon-lg" aria-label="Close example">
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
          <K.Surface variant="emblem">
            <K.Icon name="sparkles" />
          </K.Surface>
          <K.Row>
            <K.StatusMark active={true} />
            <K.Text size="sm">Active status</K.Text>
          </K.Row>
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
                <K.Button type="submit" size="icon-lg" aria-label="Submit example">
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
  return (
    <K.Stack>
      <K.Button variant="outline" onClick={() => setMenu(true)}>
        Open menu surface
      </K.Button>
      <K.Drawer open={menu} onClose={() => setMenu(false)} title="Shared menu">
        <K.Text>Navigation and Settings share this surface.</K.Text>
      </K.Drawer>
      <K.Button onClick={() => setOpen(true)}>Open adaptive panel</K.Button>
      <K.AdaptivePanel title="Supporting content" open={open} onClose={() => setOpen(false)}>
        <K.Toolbar>
          <K.Heading>Supporting content</K.Heading>
          <K.Button
            variant="ghost"
            size="icon-lg"
            aria-label="Close supporting content"
            onClick={() => setOpen(false)}
          >
            <K.Icon name="close" />
          </K.Button>
        </K.Toolbar>
        <K.Textarea aria-label="Supporting draft" defaultValue="Same content through a resize" />
      </K.AdaptivePanel>
    </K.Stack>
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
          <K.Button key={option} variant="suggestion">
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

function Provenance() {
  return <K.ProvenancePrototype />;
}

export const catalogue: Specimen[] = [
  {
    id: 'provenance',
    title: 'Wiki provenance prototype',
    description: 'The provenance reference page and its supporting evidence panel.',
    components: ['ProvenancePrototype'],
    Sample: Provenance,
    fullBleed: true,
  },
  {
    id: 'navigation',
    title: 'Navigation & workspace',
    description: 'One feature list: sidebar on desktop, footer and menu drawer on phone.',
    components: ['NavigationSuite', 'FeaturePage'],
    Sample: Navigation,
    fullBleed: true,
  },
  {
    id: 'agent',
    title: 'Agent conversation',
    description: 'The same feed, suggestions, message field and voice actions rearrange together.',
    components: [
      'ConversationPage',
      'ConversationSurface',
      'ConversationFeed',
      'ConversationWelcome',
      'Message',
      'Markdown',
      'Composer',
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
      'SettingsPage',
      'SettingsSection',
      'SettingField',
      'ThemeSwitch',
      'RadioGroup',
    ],
    Sample: Settings,
  },
  {
    id: 'search',
    title: 'Search & commands',
    description: 'Full-screen phone search and the desktop command palette.',
    components: [
      'SearchSurface',
      'SearchButton',
      'Command',
      'CommandDialog',
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
    id: 'history',
    title: 'History',
    description: 'Centered reading width, touch rows and an expandable change.',
    components: ['HistorySurface', 'HistoryEntry'],
    Sample: History,
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
    title: 'Agent panel',
    description: 'The same conversation in a centered desktop panel or full phone surface.',
    components: ['ConversationPanel'],
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
    components: ['Surface', 'Toolbar', 'ReadingColumn', 'Dock', 'StatusMark'],
    Sample: SurfacePrimitives,
    fullBleed: true,
  },
  {
    id: 'panel-primitive',
    title: 'Adaptive panel primitive',
    description:
      'One supporting content tree, with shared focus, dismissal and responsive placement.',
    components: ['AdaptivePanel', 'Drawer'],
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
    description: 'Tones, alerts, progress, loading and notifications.',
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
      'Recording',
      'Skeleton',
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
    description: 'List rows with metadata, avatars and actions.',
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
    id: 'list-detail',
    title: 'List & detail',
    description: 'Desktop shows both panes; phone gives the selected detail its space.',
    components: ['ListDetail'],
    Sample: ListAndDetail,
    fullBleed: true,
  },
  {
    id: 'tabs',
    title: 'Tabs & timeline',
    description: 'Shared tab content and chronological entries.',
    components: ['Tabs', 'TabsList', 'TabsTrigger', 'TabsContent', 'Timeline', 'TimelineItem'],
    Sample: TabsSample,
  },
  {
    id: 'charts',
    title: 'Charts',
    description: 'Accessible bars and sparklines with shared data.',
    components: ['Bars', 'Sparkline'],
    Sample: Charts,
  },
  {
    id: 'maps',
    title: 'Map',
    description: 'The shared map presentation, loaded only on request.',
    components: ['MapView'],
    Sample: Maps,
  },
  {
    id: 'changes',
    title: 'Changes & tool results',
    description: 'Code changes, note changes and collapsible agent activity.',
    components: ['CodeDiff', 'UnifiedDiff', 'ToolResult', 'Json'],
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
    description: 'Base overlay primitives, with contained live interactions.',
    components: [
      'Dialog',
      'DialogClose',
      'DialogContent',
      'DialogDescription',
      'DialogFooter',
      'DialogHeader',
      'DialogTitle',
      'DialogTrigger',
      'Drawer',
    ],
    Sample: Dialogs,
  },
  {
    id: 'frames',
    title: 'Frame & mobile controls',
    description: 'Brand, status, footer fixtures, floating action and feature drawer.',
    components: [
      'WorkspaceFrame',
      'Brand',
      'MobileHeader',
      'MobileBar',
      'MobileActionButton',
      'NavigationSheet',
    ],
    Sample: Frames,
    fullBleed: true,
  },
  {
    id: 'base-frames',
    title: 'Base frames',
    description:
      'Low-level frames for composing a workspace. Prefer NavigationSuite for feature navigation.',
    components: ['DesktopMain', 'MobileFrame'],
    Sample: LegacyFrames,
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
      'SidebarTrigger',
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
    description: 'The notice used by the sample-data design preview.',
    components: ['PreviewBar', 'DesignPreview'],
    Sample: Preview,
    fullBleed: true,
  },
  {
    id: 'side-panel',
    title: 'Supporting panel',
    description: 'A low-level supporting content panel.',
    components: ['SidePanel'],
    Sample: SidePanels,
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
