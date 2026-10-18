// Fictional entries and supplied actions exercise the real Search reading/rendering pipeline.
import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '@/shared/ui/kit/styles.css';
import { Search } from '@/core/search/presentation/index.ts';
import { opened } from '@/core/search/index.ts';
import { useRoute } from '@/core/navigation/index.ts';
import { searchIndex } from '@/core/search/index.ts';
import { Button, Input, Overlay, Stack, Text } from '@/shared/ui/kit/index.ts';

const index = searchIndex([
  { href: '/topic/studio/', t: 'Studio', e: 'Making room', a: [], k: 'topic', g: [] },
  { href: '/studio-notes/', t: 'Studio notes', e: '', a: [], k: 'note', g: [] },
  { href: '/garden/', t: 'Garden workshop', e: '', a: ['studio'], k: 'note', g: [] },
  { href: '/slow-mornings/', t: 'Slow mornings', e: '', a: [], k: 'note', g: [] },
]);

function SearchExample() {
  const [open, setOpen] = useState(false);
  const [parent, setParent] = useState(false);
  const [action, setAction] = useState('None');
  const [ask, setAsk] = useState(true);
  const route = useRoute();
  useEffect(() => opened('/slow-mornings/'), []);
  return (
    <Stack>
      <Button onClick={() => setOpen(true)}>Open Search</Button>
      <Button onClick={() => setParent(true)}>Open parent task</Button>
      <Button onClick={() => setAsk(!ask)}>Toggle ask action</Button>
      <Text role="status" aria-label="Search action">
        {action}
      </Text>
      <Text role="status" aria-label="Search destination">
        {route.path}
      </Text>
      <Overlay open={parent} onClose={() => setParent(false)} title="Parent task">
        <Input aria-label="Parent task draft" defaultValue="Keep this task" />
        <Button onClick={() => setOpen(true)}>Find from parent</Button>
      </Overlay>
      <Search
        index={index}
        open={open}
        setSearch={setOpen}
        commands={[
          {
            id: 'studio',
            label: 'Studio preferences',
            group: 'Actions',
            keys: 'mod+,',
            run: () => setAction('Opened preferences'),
          },
          {
            id: 'hidden',
            label: 'Hidden action',
            group: 'Actions',
            hidden: true,
            run: () => setAction('Hidden'),
          },
        ]}
        onAsk={ask ? (text) => setAction(`Asked: ${text}`) : undefined}
      />
    </Stack>
  );
}

createRoot(document.getElementById('app')!).render(<SearchExample />);
