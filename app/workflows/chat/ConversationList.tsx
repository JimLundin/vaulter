import { useEffect, useState } from 'react';
import {
  Stack,
  Button,
  Text,
  SelectionRow,
  SelectionGroupHeading,
  SupportingPane,
} from '../../ui/kit/index.ts';
import type { NodeConversation } from './node-conversation.ts';
import { useNodeChat } from './use-node-conversation.ts';
import type { SavedChat } from './records/chat-store.ts';
import { later } from '../../runtime/later.ts';

export function ConversationList({
  conversation,
  open,
  onClose,
  persistent = true,
  variant = 'numbered',
}: {
  conversation: NodeConversation;
  open: boolean;
  onClose: () => void;
  persistent?: boolean;
  variant?: 'rule' | 'numbered' | 'badged';
}) {
  const [visible, setVisible] = useState(false);
  const { records, selection, selectionAvailability } = useNodeChat(conversation);
  const blocked = !selectionAvailability.allowed;
  const chats = records.chats;
  useEffect(() => {
    if (visible) return conversation.watchRecords();
  }, [conversation, visible]);
  const content = (
    <Stack>
      {blocked && <Text role="status">{selectionAvailability.reason}</Text>}
      {!!(records.error || selection.error) && (
        <Text role="alert" tone="danger">
          {records.error || selection.error}
        </Text>
      )}
      {!!selection.pending && <Text role="status">Opening conversation…</Text>}
      {chats === null ? (
        <Text>Loading conversations…</Text>
      ) : !chats.length ? (
        <Text>No saved conversations yet.</Text>
      ) : (
        chats.map((chat, index) => (
          <ConversationItem
            key={chat.node}
            chat={chat}
            variant={variant}
            ordinal={
              index -
              chats.findIndex(
                (other) =>
                  new Date(other.activeAt).toDateString() ===
                  new Date(chat.activeAt).toDateString(),
              ) +
              1
            }
            group={
              index === 0 ||
              new Date(chats[index - 1].activeAt).toDateString() !==
                new Date(chat.activeAt).toDateString()
                ? new Date(chat.activeAt).toLocaleDateString('en-GB', {
                    weekday: 'short',
                    day: 'numeric',
                    month: 'short',
                  })
                : undefined
            }
            selected={chat.node === conversation.conversation()}
            disabled={blocked}
            onOpen={async (node) => {
              const outcome = await conversation.open(node);
              if (outcome.status === 'selected') onClose();
            }}
          />
        ))
      )}
      {!!records.hasMore && (
        <Button
          variant="outline"
          disabled={records.loading}
          onClick={() => later(conversation.loadOlderRecords())}
        >
          {records.loading ? 'Loading older conversations…' : 'Load older conversations'}
        </Button>
      )}
    </Stack>
  );
  return (
    <SupportingPane
      persistent={persistent}
      title="Conversations"
      open={open}
      onClose={onClose}
      onVisible={setVisible}
    >
      {content}
    </SupportingPane>
  );
}

/** A saved conversation's node data, with activity derived from its recorded children. */
export function ConversationItem({
  chat,
  selected,
  disabled,
  onOpen,
  variant = 'numbered',
  group,
  ordinal,
}: {
  chat: SavedChat;
  selected: boolean;
  disabled: boolean;
  onOpen: (node: string) => void | Promise<void>;
  variant?: 'rule' | 'numbered' | 'badged';
  group?: string;
  ordinal?: number;
}) {
  return (
    <Stack gap="xs">
      {!!group && <SelectionGroupHeading>{group}</SelectionGroupHeading>}
      <SelectionRow
        selected={selected}
        compact={true}
        disabled={disabled}
        label={chat.data.title}
        timestamp={new Date(chat.activeAt).toLocaleTimeString('en-GB', {
          hour: '2-digit',
          minute: '2-digit',
        })}
        ordinal={ordinal}
        marker={variant === 'numbered' ? 'number' : variant === 'badged' ? 'badge' : 'none'}
        onSelect={() => {
          void onOpen(chat.node);
        }}
      >
        {null}
      </SelectionRow>
    </Stack>
  );
}
