// Browser fixture exercising the public kit, without a vault or workflow dependency.
import { useId, useState } from 'react';
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
  return (
    <NavigationSuite
      status="Synced"
      search={{ label: 'Search', onSelect: () => setSearch(true) }}
      destinations={[{ label: 'Agent', href: '#agent', icon: 'sparkles', current: true }]}
      actions={['Settings', 'Help', 'Account', 'Extra'].map((label) => ({
        label,
        href: `#${label}`,
        icon: 'settings',
        current: false,
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

createRoot(document.getElementById('app')!).render(<Fixture />);
