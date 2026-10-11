import { useEffect, useState } from 'react';
import {
  Button,
  Stack,
  Text,
  SelectionRow,
  usePreviewVariant,
  SelectionGroupHeading,
  ResponsiveSupportingColumn,
} from '../../ui/kit/index.ts';
import type { NodeConversation } from './node-conversation.ts';
import { useNodeChat } from './use-node-conversation.ts';
import type { SavedChat } from './records/chat-store.ts';

export function ConversationList({
  conversation,
  open,
  onClose,
  disabled = false,
  variant: suppliedVariant = 'rule',
}: {
  conversation: NodeConversation;
  open: boolean;
  onClose: () => void;
  disabled?: boolean;
  variant?: 'rule' | 'numbered' | 'rail';
}) {
  const override = usePreviewVariant('chat.conversation-list');
  const variant = override === 'numbered' || override === 'rail' ? override : suppliedVariant;
  const [visible, setVisible] = useState(false);
  const state = useNodeChat(conversation);
  const [chats, setChats] = useState<readonly SavedChat[] | null>(null);
  const [error, setError] = useState('');
  const [opening, setOpening] = useState(false);
  const blocked =
    disabled ||
    opening ||
    state.busy ||
    !!state.persistenceError ||
    !!state.contentPersistence ||
    !!state.contextError;
  useEffect(() => {
    if (!visible) return;
    let active = true;
    let generation = 0;
    const reload = async () => {
      const request = ++generation;
      try {
        const result = await conversation.chats();
        if (active && request === generation) {
          setChats(result);
          setError('');
        }
      } catch (e) {
        if (active && request === generation) setError(String(e));
      }
    };
    void reload();
    const off = conversation.subscribeRecords(() => void reload());
    return () => {
      active = false;
      off();
    };
  }, [conversation, visible]);
  const content = (
    <Stack>
      <Button
        disabled={blocked}
        onClick={() => {
          conversation.newChat();
          onClose();
        }}
      >
        New conversation
      </Button>
      {blocked && (
        <Text role="status">
          Finish recording or resolve the pending operation before switching conversations.
        </Text>
      )}
      {!!error && (
        <Text role="alert" tone="danger">
          {error}
        </Text>
      )}
      {chats === null ? (
        <Text>Loading conversations…</Text>
      ) : !chats.length ? (
        <Text>No saved conversations yet.</Text>
      ) : (
        chats.map((chat, index) => (
          <ConversationItem
            key={chat.node}
            {...chat.data}
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
            activeAt={chat.activeAt}
            selected={chat.node === conversation.conversation()}
            disabled={blocked}
            onOpen={async () => {
              setOpening(true);
              try {
                await conversation.open(chat.node);
                if (conversation.conversation() === chat.node) onClose();
              } catch (e) {
                setError(String(e));
              } finally {
                setOpening(false);
              }
            }}
          />
        ))
      )}
    </Stack>
  );
  return (
    <ResponsiveSupportingColumn
      title="Conversations"
      open={open}
      onClose={onClose}
      onVisible={setVisible}
    >
      {content}
    </ResponsiveSupportingColumn>
  );
}

/** A saved conversation's node data, with activity derived from its recorded children. */
export function ConversationItem({
  title,
  activeAt,
  selected,
  disabled,
  onOpen,
  variant = 'rule',
  group,
  ordinal,
}: {
  kind: 'conversation';
  title: string;
  createdAt: string;
  activeAt: string;
  selected: boolean;
  disabled: boolean;
  onOpen: () => Promise<void>;
  variant?: 'rule' | 'numbered' | 'rail';
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
        label={title}
        timestamp={new Date(activeAt).toLocaleTimeString('en-GB', {
          hour: '2-digit',
          minute: '2-digit',
        })}
        ordinal={ordinal}
        marker={variant === 'numbered' ? 'number' : variant === 'rail' ? 'rail' : 'none'}
        onSelect={() => {
          void onOpen();
        }}
      >
        {null}
      </SelectionRow>
    </Stack>
  );
}
