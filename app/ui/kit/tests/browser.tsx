// Browser fixture exercising the public kit, without a vault or workflow dependency.
import { useRef, useState } from 'react';
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
  Drawer,
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
  RadioGroup,
  RadioGroupItem,
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

function PolicyFixture() {
  const [parent, setParent] = useState(false);
  const [child, setChild] = useState(false);
  const [peer, setPeer] = useState(false);
  return (
    <Stack>
      <Input aria-label="Background draft" defaultValue="Background remains usable" />
      <Button onClick={() => setParent(true)}>Open parent drawer</Button>
      <Button onClick={() => setPeer(true)}>Open peer drawer</Button>
      <Drawer open={parent} onClose={() => setParent(false)} title="Parent">
        <Input aria-label="Parent draft" defaultValue="Parent task" />
        <Button onClick={() => setChild(true)}>Open nested review</Button>
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button>Parent options</Button>} />
          <DropdownMenuContent>
            <DropdownMenuItem>Keep task</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Overlay open={child} onClose={() => setChild(false)} title="Nested review">
          <Input aria-label="Child draft" defaultValue="Child task" />
          <Button onClick={() => setParent(false)}>Close parent from child</Button>
        </Overlay>
      </Drawer>
      <Drawer open={peer} onClose={() => setPeer(false)} title="Peer">
        <Input aria-label="Peer draft" defaultValue="Peer task" />
      </Drawer>
    </Stack>
  );
}

function Fixture() {
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
          <SettingField label="Preference" description="The same field at every size">
            <Input defaultValue="Keep this value" />
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
            <DropdownMenuTrigger render={<Button>More controls</Button>} />
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
              <SettingField
                label="Calendar preference"
                description="Saved for the current calendar."
              >
                <Input
                  value={calendar}
                  onChange={(event) => setCalendar(event.currentTarget.value)}
                />
              </SettingField>
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

function FieldFixture() {
  return (
    <SettingsPage>
      <SettingsSection title="Text association">
        <SettingField label="Default model" description="Used for new conversations.">
          <Input defaultValue="Initial model" />
        </SettingField>
        <SettingField label="Conversation notes" description="Keep context for the next message.">
          <Stack>
            <InputGroup>
              <Textarea defaultValue="Initial notes" />
            </InputGroup>
          </Stack>
        </SettingField>
        <SettingField label="Identified model" description="An existing reference still works.">
          {/* biome-ignore lint/correctness/useUniqueElementIds: Singleton fixture verifies preservation of an explicit control identity. */}
          <Input id="identified-model" aria-label="Overridden control name" />
        </SettingField>
        {/* biome-ignore lint/correctness/useUniqueElementIds: Singleton fixture supplies a known additional description reference. */}
        <Text id="model-guidance">Additional model guidance.</Text>
        <SettingField label="Nested model" description="Use the recommended model.">
          <Stack>
            <Row>
              <InputGroup>
                <InputGroupInput aria-describedby="model-guidance model-guidance" />
              </InputGroup>
            </Row>
          </Stack>
        </SettingField>
        {['First repeated model', 'Second repeated model'].map((label) => (
          <SettingField key={label} label={label} description="Each field keeps its own meaning.">
            <Input defaultValue="Separate value" />
          </SettingField>
        ))}
        <SettingField label="Field theme" description="Choose how this device looks.">
          <Stack>
            <ThemeSwitch />
          </Stack>
        </SettingField>
        {/* biome-ignore lint/correctness/useUniqueElementIds: Singleton fixture supplies an additional group description. */}
        <Text id="mode-guidance">Additional mode guidance.</Text>
        {['First mode', 'Second mode'].map((label) => (
          <SettingField key={label} label={label} description="Choose one mode.">
            <Stack>
              <Row>
                <RadioGroup
                  defaultValue="one"
                  aria-label="Conflicting mode"
                  aria-describedby="mode-guidance mode-guidance"
                >
                  <RadioGroupItem value="one">One</RadioGroupItem>
                  <RadioGroupItem value="two">Two</RadioGroupItem>
                </RadioGroup>
              </Row>
            </Stack>
          </SettingField>
        ))}
        <ThemeSwitch />
        {/* biome-ignore lint/correctness/useUniqueElementIds: Singleton fixture supplies a known standalone description reference. */}
        <Text id="standalone-guidance">Standalone instructions.</Text>
        {/* biome-ignore lint/correctness/useUniqueElementIds: Singleton fixture verifies a standalone explicit identity remains intact. */}
        <Input
          id="standalone-model"
          aria-label="Standalone model"
          aria-describedby="standalone-guidance"
        />
      </SettingsSection>
    </SettingsPage>
  );
}

createRoot(document.getElementById('app')!).render(
  new URLSearchParams(location.search).has('policy') ? (
    <PolicyFixture />
  ) : new URLSearchParams(location.search).has('setting-fields') ? (
    <FieldFixture />
  ) : new URLSearchParams(location.search).has('composer') ? (
    <ComposerFixture />
  ) : (
    <Fixture />
  ),
);
