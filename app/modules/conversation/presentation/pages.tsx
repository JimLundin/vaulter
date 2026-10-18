import type { ReactNode } from 'react';
import type { RecordEmbed } from '@/core/embeds/index.ts';
// biome-ignore lint/correctness/noUnresolvedImports: React 19 exposes Suspense; TypeScript and the build verify it
import { lazy, Suspense } from 'react';
import { Activity, Text } from '@/shared/ui/kit/index.ts';
import type { Conversation } from '@/modules/conversation/conversation.ts';
import { useChat } from '@/modules/conversation/use-conversation.ts';
import type { Prompt } from './Chat.tsx';
import type { ToolPresentationAdapter } from '@/modules/agent/presentation/index.ts';
export {
  useConversation,
  useChat,
} from '@/modules/conversation/use-conversation.ts';
export { ChatSettings } from './settings.tsx';
export type { Prompt } from './Chat.tsx';
const Chat = lazy(() => import('./Chat.tsx').then((module) => ({ default: module.Chat })));
export function ChatPanel({
  conversation,
  prompt = null,
  open,
  onClose,
  toolPresentations,
  renderEmbed,
  embedControls,
}: {
  embedControls?: ReactNode;
  renderEmbed?: (embed: RecordEmbed) => ReactNode;
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
        renderEmbed={renderEmbed}
        embedControls={embedControls}
      />
    </Suspense>
  );
}
export function ChatPage({
  conversation,
  prompt = null,
  toolPresentations,
  renderEmbed,
  embedControls,
}: {
  embedControls?: ReactNode;
  renderEmbed?: (embed: RecordEmbed) => ReactNode;
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
        renderEmbed={renderEmbed}
        embedControls={embedControls}
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

export { ChatMessage } from './ChatMessage.tsx';
