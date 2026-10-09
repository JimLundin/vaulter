// Browser fixture exercises public control props and native form behavior.
import { useId, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../styles.css';
import {
  Button,
  Checkbox,
  Label,
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
  return (
    <Stack>
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
      <output>{submitted}</output>
      <ToggleGroup type="single" aria-label="Time range" value={range} onValueChange={setRange}>
        <ToggleGroupItem value="day">Day</ToggleGroupItem>
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
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList aria-label="Automatic tabs">
          <TabsTrigger value="notes">Notes</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
        </TabsList>
        <TabsContent value="notes">Saved notes</TabsContent>
        <TabsContent value="activity">Recent activity</TabsContent>
      </Tabs>
      <Text>Active tab: {tab}</Text>
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
