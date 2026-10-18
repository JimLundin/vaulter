import { useEffect, useState } from 'react';
import { Button, Stack, Text } from '@/shared/ui/kit/index.ts';
import { openDatabase } from '@/core/store/index.ts';
import { wikiSchema } from '@/modules/wiki/records.ts';
import { useEavWikiReading, type EavWikiInput } from '@/modules/wiki/reading.ts';
import { Wiki } from '@/modules/wiki/presentation/index.tsx';
import { pageRoute } from '@/modules/wiki/routes.ts';
import { seedEavWiki } from './wiki-records.ts';

export function WikiExample({ controls = false }: { controls?: boolean }) {
  const [input, setInput] = useState<EavWikiInput | null>(null);
  const [seedError, setSeedError] = useState('');
  const { pages, error: readError } = useEavWikiReading(input);
  const error = seedError || readError;
  const [state, setState] = useState('page');
  const [selected, setSelected] = useState<string | undefined>('preview:page:0');
  useEffect(() => {
    let active = true;
    const opening = openDatabase({ schema: wikiSchema });
    void opening
      .then(async (db) => {
        await seedEavWiki(db);
        if (active) setInput({ database: () => Promise.resolve(db) });
      })
      .catch((problem: unknown) => {
        if (active) setSeedError(String(problem));
      });
    return () => {
      active = false;
      void opening.then((db) => db[Symbol.asyncDispose]());
    };
  }, []);
  return (
    <Stack fill={true}>
      <Wiki
        pages={state === 'loading' ? null : pages}
        node={state === 'missing' ? 'missing' : selected}
        onNavigate={(path) => setSelected(pageRoute.match(path)?.node)}
        error={state === 'error' ? 'Fictional read failed.' : error}
      />
      {controls && (
        <Stack>
          <Button onClick={() => setState(state === 'page' ? 'loading' : 'page')}>
            Toggle loading
          </Button>
          <Button onClick={() => setState('error')}>Show error</Button>
          <Button onClick={() => setState('missing')}>Show unavailable page</Button>
          {!!error && <Text tone="danger">{error}</Text>}
        </Stack>
      )}
    </Stack>
  );
}
