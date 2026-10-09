// Browser fixture exercising the public kit, without a vault or workflow dependency.
import { useId, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../styles.css';
import {
  Button,
  Bars,
  Checkbox,
  Command,
  CommandInput,
  CommandItem,
  CommandList,
  ConversationPanel,
  Composer,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Input,
  InputGroup,
  InputGroupInput,
  InputGroupButton,
  NavigationSuite,
  Overlay,
  Row,
  SearchSurface,
  SettingField,
  SettingsPage,
  SettingsMenu,
  SettingsSection,
  ThemeSwitch,
  Stack,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Text,
  Textarea,
  ToggleGroup,
  ToggleGroupItem,
} from '../index.ts';

function Fixture() {
  const preference = useId();
  const [search, setSearch] = useState(false);
  const [review, setReview] = useState(false);
  const [panel, setPanel] = useState(false);
  const [settings, setSettings] = useState(false);
  const [calendar, setCalendar] = useState('Initial preference');
  return (
    <NavigationSuite
      status="Synced"
      search={{ label: 'Search', onSelect: () => setSearch(true) }}
      destinations={[{ label: 'Agent', href: '#agent', icon: 'sparkles', current: true }]}
      actions={['Settings', 'Help', 'Account', 'Extra'].map((label) => ({
        label,
        href: label === 'Settings' ? undefined : `#${label}`,
        onSelect: label === 'Settings' ? () => setSettings(true) : undefined,
        icon: 'settings',
        current: label === 'Settings' && settings,
        expanded: label === 'Settings' ? settings : undefined,
      }))}
      primary={{
        expanded: <Button onClick={() => setPanel(true)}>Open agent</Button>,
        compact: <Button onClick={() => setPanel(true)}>Open agent</Button>,
      }}
      aside={
        <ConversationPanel open={panel} onClose={() => setPanel(false)}>
          <Textarea aria-label="Panel draft" defaultValue="Preserved panel draft" />
          <Button onClick={() => setReview(true)}>Review in panel</Button>
        </ConversationPanel>
      }
    >
      <SettingsPage>
        <SettingsSection title="Controls">
          <SettingField
            label="Preference"
            htmlFor={preference}
            description="The same field at every size"
          >
            <Input id={preference} defaultValue="Keep this value" />
          </SettingField>
          <Row wrap={true}>
            <Button size="xs">Small button</Button>
            <Button size="icon-xs" aria-label="Small icon">
              +
            </Button>
            <Checkbox aria-label="Remember" />
          </Row>
          <InputGroup>
            <InputGroupInput aria-label="Grouped input" />
            <InputGroupButton>Go</InputGroupButton>
          </InputGroup>
          <Tabs defaultValue="first">
            <TabsList>
              <TabsTrigger value="first">First</TabsTrigger>
              <TabsTrigger value="second">Second</TabsTrigger>
            </TabsList>
            <TabsContent value="first">
              <Text>First tab content</Text>
            </TabsContent>
            <TabsContent value="second">
              <Text>Second tab content</Text>
            </TabsContent>
          </Tabs>
          <ToggleGroup type="single" size="sm">
            <ToggleGroupItem value="one">One</ToggleGroupItem>
            <ToggleGroupItem value="two">Two</ToggleGroupItem>
          </ToggleGroup>
          <ThemeSwitch />
          <Bars
            label="Long series"
            data={Array.from({ length: 14 }, (_, i) => ({ label: `Day ${i + 1}`, value: i + 1 }))}
          />
          <DropdownMenu>
            <DropdownMenuTrigger asChild={true}>
              <Button>More controls</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem>Menu item</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button onClick={() => setReview(true)}>Open review</Button>
        </SettingsSection>
      </SettingsPage>
      <SettingsMenu
        open={settings}
        onClose={() => setSettings(false)}
        features={[
          {
            name: 'Calendar',
            content: (
              <Input
                aria-label="Calendar preference"
                value={calendar}
                onChange={(event) => setCalendar(event.currentTarget.value)}
              />
            ),
          },
        ]}
      />
      <SearchSurface open={search} onClose={() => setSearch(false)}>
        <Command>
          <CommandInput aria-label="Search query" />
          <CommandList>
            <CommandItem>Result one</CommandItem>
            <CommandItem>Result two</CommandItem>
          </CommandList>
        </Command>
      </SearchSurface>
      <Overlay open={review} onClose={() => setReview(false)} title="Review">
        <Stack>
          <Input aria-label="Review draft" defaultValue="Preserved review draft" />
          <Button onClick={() => setReview(false)}>Done</Button>
        </Stack>
      </Overlay>
    </NavigationSuite>
  );
}

function ComposerFixture() {
  const [draft, setDraft] = useState('');
  const [submitted, setSubmitted] = useState<string[]>([]);
  const [allowed, setAllowed] = useState(true);
  const [busy, setBusy] = useState(false);
  const [stops, setStops] = useState(0);
  const [focused, setFocused] = useState(false);
  const [phase, setPhase] = useState<'idle' | 'connecting' | 'listening' | 'finishing'>('idle');
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  const recording = phase !== 'idle';
  return (
    <Stack>
      <Composer
        draft={draft}
        onDraftChange={setDraft}
        onSubmit={(text) => setSubmitted([...submitted, text])}
        label="Fixture message"
        placeholder="Write a controlled draft"
        canSubmit={allowed && !recording}
        busy={busy}
        readOnly={recording}
        voice={{ phase, onClick: () => setPhase(phase === 'idle' ? 'listening' : 'idle') }}
        onStop={() => {
          setStops(stops + 1);
          setBusy(false);
        }}
        fieldRef={fieldRef}
        onFocusChange={setFocused}
      />
      <Text>Submitted drafts: {JSON.stringify(submitted)}</Text>
      <Text>Stop actions: {stops}</Text>
      <Text>Field focused: {String(focused)}</Text>
      <Button onClick={() => setAllowed(!allowed)}>
        {allowed ? 'Deny submission' : 'Allow submission'}
      </Button>
      <Button onClick={() => setBusy(true)}>Begin response</Button>
      <Row wrap={true}>
        {(['connecting', 'listening', 'finishing', 'idle'] as const).map((state) => (
          <Button key={state} onClick={() => setPhase(state)}>
            {state} capture
          </Button>
        ))}
      </Row>
      <Button
        onClick={() => {
          setDraft('A suggested thought');
          fieldRef.current?.focus();
        }}
      >
        Use suggested thought
      </Button>
    </Stack>
  );
}

createRoot(document.getElementById('app')!).render(
  new URLSearchParams(location.search).has('composer') ? <ComposerFixture /> : <Fixture />,
);
