import { useEffect, useState, type ReactNode } from 'react';
import type { RecordEmbed } from '@/core/embeds/index.ts';
import type { TransactionRef } from '@/core/store/index.ts';
import { Stack, Text } from '@/shared/ui/kit/index.ts';
import {
  readEmbeddedRecord,
  type EmbedDatabase,
  type EmbeddedOwnerView,
} from '@/application/composition/embeds.ts';

/** Reading and subscribing never starts an Agent, collects an Answer or publishes records. */
export function EmbeddedRecord({
  database,
  embed,
  cutoff,
  ownerView,
}: {
  database: Promise<EmbedDatabase> | null;
  embed: RecordEmbed;
  cutoff?: TransactionRef;
  ownerView?: EmbeddedOwnerView;
}) {
  const [state, setState] = useState<{ content?: ReactNode; error?: string }>({});
  const { mode, target } = embed;
  useEffect(() => {
    let active = true;
    let generation = 0;
    setState({});
    let unsubscribe: (() => void) | undefined;
    const reload = async () => {
      if (!database) return;
      const request = ++generation;
      try {
        const db = await database;
        if (!active || request !== generation) return;
        if (mode === 'live' && !cutoff) unsubscribe ??= db.subscribe(() => void reload());
        const content = await readEmbeddedRecord(db, { mode, target }, cutoff, ownerView);
        if (active && request === generation) setState({ content });
      } catch (error) {
        if (active && request === generation)
          setState({ error: error instanceof Error ? error.message : String(error) });
      }
    };
    void reload();
    return () => {
      active = false;
      generation++;
      unsubscribe?.();
    };
  }, [database, mode, target, cutoff, ownerView]);
  return (
    <Stack gap="xs">
      {(embed.mode === 'pinned' || cutoff) && (
        <Text tone="muted" size="xs">
          {embed.mode === 'pinned' ? 'Pinned recorded state' : 'Recorded host state'}
        </Text>
      )}
      {state.error ? (
        <Text role="status">Embedded record unavailable: {state.error}</Text>
      ) : (
        (state.content ?? (
          <Text tone="muted">
            {database !== null
              ? 'Loading embedded record…'
              : 'Embedded record storage is unavailable.'}
          </Text>
        ))
      )}
    </Stack>
  );
}
