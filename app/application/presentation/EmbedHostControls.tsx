import { useEffect, useState, useRef } from 'react';
import { EmbedControls, type EmbedPlacement } from '@/core/embeds/presentation/index.tsx';
import { Button, Select, Stack, Text } from '@/shared/ui/kit/index.ts';
import {
  embedHostActions,
  readEmbedChoices,
  readChatEmbedPlacements,
  type EmbedDatabase,
} from '@/application/composition/embeds.ts';
import type { EmbedHostPage } from '@/application/composition/embeds.ts';

export function EmbedHostControls({
  database,
  user,
  page,
  disabledReason,
  onSaved,
}: {
  database: Promise<EmbedDatabase>;
  user: string;
  page?: EmbedHostPage;
  disabledReason?: string;
  onSaved?: () => Promise<unknown>;
}) {
  const [open, setOpen] = useState(false);
  const admission = useRef(disabledReason);
  admission.current = disabledReason;
  const [data, setData] = useState<Awaited<ReturnType<typeof readEmbedChoices>>>({
    choices: [],
    exchanges: [],
  });
  const [exchangeKey, setExchangeKey] = useState('');
  const [placements, setPlacements] = useState<EmbedPlacement[]>([]);
  const [error, setError] = useState<string>();
  const exchange =
    data.exchanges.find((entry) => entry.reference.entity === exchangeKey) ?? data.exchanges[0];
  useEffect(() => {
    if (!open) return;
    let active = true;
    let generation = 0;
    let unsubscribe: (() => void) | undefined;
    const reload = async () => {
      const request = ++generation;
      try {
        const db = await database;
        if (!active || request !== generation) return;
        unsubscribe ??= db.subscribe(() => void reload());
        const next = await readEmbedChoices(db);
        const selected =
          next.exchanges.find((entry) => entry.reference.entity === exchangeKey) ??
          next.exchanges[0];
        const hostPlacements: EmbedPlacement[] = [];
        if (!page && selected) {
          hostPlacements.push(
            ...(await readChatEmbedPlacements(db, selected.reference, next.choices)),
          );
        }
        if (active && request === generation) {
          setData(next);
          setPlacements(hostPlacements);
          setError(undefined);
        }
      } catch (failure) {
        if (active && request === generation) setError(String(failure));
      }
    };
    void reload();
    return () => {
      active = false;
      generation++;
      unsubscribe?.();
    };
  }, [database, page, exchangeKey, open]);
  const wikiPlacements = page?.blocks
    .filter((block) => block.embed)
    .map((block) => ({
      key: block.id,
      mode: block.embed!.mode,
      label:
        data.choices.find((choice) => choice.target.entity === block.embed!.target.entity)?.label ??
        'Embedded record',
    }));
  if (!open)
    return (
      <Button variant="ghost" onClick={() => setOpen(true)}>
        Embed a record
      </Button>
    );
  return (
    <Stack gap="sm">
      {!page && (
        <Select
          aria-label="Attach to exchange"
          value={exchange?.reference.entity ?? ''}
          options={data.exchanges.map((entry) => ({
            value: entry.reference.entity,
            label: entry.label,
          }))}
          onChange={(event) => setExchangeKey(event.currentTarget.value)}
          disabled={!!disabledReason}
        />
      )}
      {error && <Text role="status">Could not read embed choices: {error}</Text>}
      <EmbedControls
        onSaved={onSaved}
        choices={data.choices}
        placements={wikiPlacements ?? placements}
        disabledReason={
          disabledReason ??
          (!(page || exchange) ? 'Send a contribution before attaching records.' : undefined)
        }
        add={async (embed) => {
          const actions = embedHostActions(await database, user, () => admission.current);
          return page ? actions.wiki(page.id, embed) : actions.chat(exchange!.reference, embed);
        }}
        remove={async (key) => {
          const actions = embedHostActions(await database, user, () => admission.current);
          return page ? actions.removeWiki(key) : actions.removeChat(exchange!.reference, key);
        }}
      />
    </Stack>
  );
}
