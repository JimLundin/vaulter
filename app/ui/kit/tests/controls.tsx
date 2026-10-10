// Browser fixture exercises public control props and native form behavior.
import { useId, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../styles.css';
import {
  Button,
  Checkbox,
  Columns,
  Command,
  CommandInput,
  CommandList,
  CommandItem,
  CommandEmpty,
  Label,
  Input,
  Stack,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Text,
  ToggleGroup,
  ToggleGroupItem,
} from '../index.ts';

function ControlsFixture() {
  const rememberId = useId();
  const [remember, setRemember] = useState<boolean | 'indeterminate'>('indeterminate');
  const [submitted, setSubmitted] = useState('');
  const [range, setRange] = useState('day');
  const [formats, setFormats] = useState(['bold']);
  const [tab, setTab] = useState('notes');
  const commandRef = useRef<HTMLDivElement>(null);
  const [extraResult, setExtraResult] = useState(false);
  const [chosen, setChosen] = useState('');
  return (
    <Stack>
      <Columns>
        <Input aria-label="Two-column first" defaultValue="First content" />
        <Input aria-label="Two-column second" defaultValue="Second content" />
      </Columns>
      <Columns count={3} gap="lg">
        <Input aria-label="Three-column first" defaultValue="First content" />
        <Input aria-label="Three-column second" defaultValue="Second content" />
        <Input aria-label="Three-column third" defaultValue="Third content" />
      </Columns>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          setSubmitted(`Remember: ${data.get('remember') ?? 'absent'}`);
        }}
      >
        <Label htmlFor={rememberId}>Remember me</Label>
        <Checkbox
          id={rememberId}
          name="remember"
          value="yes"
          checked={remember}
          onCheckedChange={setRemember}
        />
        <Button type="submit">Submit preferences</Button>
      </form>
      <output aria-label="Submitted preferences">{submitted}</output>
      <ToggleGroup type="single" aria-label="Time range" value={range} onValueChange={setRange}>
        <ToggleGroupItem value="day">Day</ToggleGroupItem>
        <ToggleGroupItem value="month" disabled={true}>
          Month
        </ToggleGroupItem>
        <ToggleGroupItem value="week">Week</ToggleGroupItem>
      </ToggleGroup>
      <Text>Single value: {range || 'empty'}</Text>
      <ToggleGroup
        type="multiple"
        aria-label="Formatting"
        value={formats}
        onValueChange={setFormats}
      >
        <ToggleGroupItem value="bold">Bold</ToggleGroupItem>
        <ToggleGroupItem value="italic">Italic</ToggleGroupItem>
      </ToggleGroup>
      <Text>Multiple values: {formats.join(',')}</Text>
      <ToggleGroup type="single" aria-label="Default range" defaultValue="day">
        <ToggleGroupItem value="day">Day</ToggleGroupItem>
        <ToggleGroupItem value="week">Week</ToggleGroupItem>
      </ToggleGroup>
      <ToggleGroup type="multiple" aria-label="Default filters" defaultValue={['notes']}>
        <ToggleGroupItem value="notes">Notes</ToggleGroupItem>
        <ToggleGroupItem value="events">Events</ToggleGroupItem>
      </ToggleGroup>
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList aria-label="Automatic tabs">
          <TabsTrigger value="notes">Notes</TabsTrigger>
          <TabsTrigger value="archived" disabled={true}>
            Archived
          </TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
        </TabsList>
        <TabsContent value="notes">Saved notes</TabsContent>
        <TabsContent value="activity">Recent activity</TabsContent>
      </Tabs>
      <Text>Active tab: {tab}</Text>
      <Tabs defaultValue="draft">
        <TabsList aria-label="Draft lifetime tabs">
          <TabsTrigger value="draft">Preserved draft</TabsTrigger>
          <TabsTrigger value="temporary">Temporary draft</TabsTrigger>
        </TabsList>
        <TabsContent value="draft" forceMount={true}>
          <Input aria-label="Preserved tab draft" defaultValue="Initial retained draft" />
        </TabsContent>
        <TabsContent value="temporary">
          <Input aria-label="Temporary tab draft" defaultValue="Initial temporary draft" />
        </TabsContent>
      </Tabs>
      <Button onClick={() => setExtraResult(true)}>Add coffee result</Button>
      <Command>
        <CommandInput aria-label="Find a result" />
        <CommandList aria-label="Live results">
          <CommandEmpty>No matching results.</CommandEmpty>
          <CommandItem ref={commandRef} onSelect={setChosen}>
            Coffee with Anna
          </CommandItem>
          {extraResult && <CommandItem onSelect={setChosen}>Coffee with Jim</CommandItem>}
        </CommandList>
      </Command>
      <Text>Chosen result: {chosen}</Text>
      <Command>
        <CommandInput aria-label="Fixed result query" value="Coffee" />
        <CommandList aria-label="Fixed results">
          <CommandItem>Coffee with Anna</CommandItem>
        </CommandList>
      </Command>
      <Tabs defaultValue="summary" activationMode="manual">
        <TabsList aria-label="Manual tabs">
          <TabsTrigger value="summary">Summary</TabsTrigger>
          <TabsTrigger value="details">Details</TabsTrigger>
        </TabsList>
        <TabsContent value="summary">Summary view</TabsContent>
        <TabsContent value="details">Detailed view</TabsContent>
      </Tabs>
    </Stack>
  );
}

createRoot(document.getElementById('app')!).render(<ControlsFixture />);
