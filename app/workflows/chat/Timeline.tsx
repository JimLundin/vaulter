import { renderMarkdown } from './rendering/markdown.ts';
import { useEffect, useState } from 'react';
import {
  Button,
  Stack,
  Text,
  SelectionRow,
  SelectionGroupHeading,
  SupportingPane,
  Markdown,
} from '../../ui/kit/index.ts';
import type { NodeConversation } from './node-conversation.ts';
import type { TimelineEntry } from './data/timeline.ts';
import { useNodeChat } from './use-node-conversation.ts';
import { later } from '../../runtime/later.ts';

export function Timeline({
  conversation,
  open,
  persistent,
  onClose,
  onJump,
}: {
  conversation: NodeConversation;
  open: boolean;
  persistent: boolean;
  onClose: () => void;
  onJump: (index: number) => void;
}) {
  const [visible, setVisible] = useState(false);
  const [entries, setEntries] = useState<readonly TimelineEntry[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<number>();
  const { checkpoint } = useNodeChat(conversation);
  useEffect(() => {
    if (!visible) return;
    let active = true;
    let generation = 0;
    const read = async () => {
      const current = ++generation;
      try {
        const next = await conversation.timeline();
        if (active && current === generation) {
          setEntries(next);
          setError('');
          setLoading(false);
        }
      } catch (error) {
        if (active && current === generation) {
          setError(String(error));
          setLoading(false);
        }
      }
    };
    void read();
    const unsubscribe = conversation.watchTimeline(() => void read());
    return () => {
      active = false;
      unsubscribe();
    };
  }, [conversation, visible]);
  const jump = (entry: TimelineEntry) => {
    setSelected(entry.position);
    onJump(entry.anchor);
    onClose();
  };
  const pending = checkpoint?.phase === 'running' || checkpoint?.phase === 'stopping';
  const saving = checkpoint?.retryable;
  return (
    <SupportingPane
      title="Timeline"
      open={open}
      persistent={persistent}
      onClose={onClose}
      onVisible={setVisible}
    >
      <Stack>
        <Text tone="muted">
          One conversation. Jump to a moment or save context for what comes next.
        </Text>
        <Button
          variant="outline"
          onClick={() => {
            setSelected(undefined);
            onJump(-1);
            onClose();
          }}
        >
          Latest activity
        </Button>
        <Button
          disabled={pending || saving || !entries.length || !!conversation.availability()}
          onClick={() => later(conversation.createCheckpoint())}
        >
          {checkpoint?.phase === 'stopping'
            ? 'Stopping checkpoint…'
            : pending
              ? 'Creating checkpoint…'
              : 'Create checkpoint'}
        </Button>
        {pending && (
          <Button
            variant="ghost"
            disabled={checkpoint?.phase === 'stopping'}
            onClick={conversation.stopCheckpoint}
          >
            Stop checkpoint
          </Button>
        )}
        {!!checkpoint?.error && <Text role="status">{checkpoint.error}</Text>}
        {saving && (
          <Button onClick={() => later(conversation.retryCheckpoint())}>
            Retry checkpoint save
          </Button>
        )}
        {checkpoint?.phase === 'complete' && (
          <Text role="status">Checkpoint saved for future Agent context.</Text>
        )}
        {error && (
          <Text role="alert" tone="danger">
            {error}
          </Text>
        )}
        {loading ? (
          <Text>Loading timeline…</Text>
        ) : (
          !entries.length && <Text>Your conversation will appear here.</Text>
        )}
        {entries.map((entry, index) => {
          const day = entry.at.slice(0, 10) || 'Unknown date';
          return (
            <Stack key={entry.position} gap="xs">
              {(index === 0 || entries[index - 1].at.slice(0, 10) !== entry.at.slice(0, 10)) && (
                <SelectionGroupHeading>{day}</SelectionGroupHeading>
              )}
              <SelectionRow
                label={entry.title}
                selected={selected === entry.position}
                compact={true}
                timestamp={entry.at.includes('T') ? entry.at.slice(11, 16) : undefined}
                ordinal={index + 1}
                marker="number"
                onSelect={() => jump(entry)}
              >
                {null}
              </SelectionRow>
              {entry.checkpoints.map((item, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: rows have no local state; disclosure belongs to the exchange.
                <Stack key={i} gap="xs">
                  <SelectionRow
                    label={item.title}
                    selected={selected === entry.position}
                    compact={true}
                    marker="none"
                    onSelect={() => setSelected(entry.position)}
                  >
                    {null}
                  </SelectionRow>
                  <Text tone="subtle">Context checkpoint · through this moment</Text>
                  {selected === entry.position && (
                    <Stack gap="xs">
                      <Markdown>{renderMarkdown(item.summary)}</Markdown>
                      <Button variant="outline" onClick={() => jump(entry)}>
                        Jump to this moment
                      </Button>
                      <Text tone="subtle">
                        {item.run.author.name} · {item.run.requestedModel} ·{' '}
                        {item.createdAt.toLocaleString()}
                      </Text>
                    </Stack>
                  )}
                </Stack>
              ))}
            </Stack>
          );
        })}
      </Stack>
    </SupportingPane>
  );
}
