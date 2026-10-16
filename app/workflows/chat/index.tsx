// biome-ignore lint/correctness/noUnresolvedImports: React 19 exposes Suspense; TypeScript and the build verify it
import { lazy, Suspense } from 'react';
import { Activity, Text } from '../../ui/kit/index.ts';
import type { NodeConversation as Conversation } from './node-conversation.ts';
import { useNodeChat as useChat } from './use-node-conversation.ts';
import type { Prompt } from './Chat.tsx';
import type { ToolPresentationAdapter } from '../../agent/tool-presentation.tsx';
export {
  useNodeConversation as useConversation,
  useNodeChat as useChat,
} from './use-node-conversation.ts';
export { ChatSettings } from './settings.tsx';
export type { Prompt } from './Chat.tsx';
const Chat = lazy(() => import('./Chat.tsx').then((module) => ({ default: module.Chat })));
export function ChatPanel({
  conversation,
  prompt = null,
  open,
  onClose,
  toolPresentations,
}: {
  conversation: Conversation;
  prompt?: Prompt | null;
  open: boolean;
  onClose: () => void;
  toolPresentations?: readonly ToolPresentationAdapter[];
}) {
  return (
    <Suspense fallback={<Text tone="subtle">Loading conversation…</Text>}>
      <Chat
        conversation={conversation}
        arg={prompt}
        presentation={{ open, onClose }}
        toolPresentations={toolPresentations}
      />
    </Suspense>
  );
}
export function ChatPage({
  conversation,
  prompt = null,
  toolPresentations,
}: {
  conversation: Conversation;
  prompt?: Prompt | null;
  toolPresentations?: readonly ToolPresentationAdapter[];
}) {
  return (
    <Suspense fallback={<Text tone="subtle">Loading conversation…</Text>}>
      <Chat
        conversation={conversation}
        arg={prompt}
        presentation={{ page: true }}
        toolPresentations={toolPresentations}
      />
    </Suspense>
  );
}
export function ChatIndicator({ conversation }: { conversation: Conversation }) {
  const { busy, unread } = useChat(conversation);
  return busy || unread ? (
    <Activity busy={busy} label={busy ? 'The agent is working' : 'The agent replied'} />
  ) : null;
}

export { ConversationList, ConversationItem } from './ConversationList.tsx';

export { ChatMessage } from './ChatMessage.tsx';
