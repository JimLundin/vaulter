// biome-ignore lint/correctness/noUnresolvedImports: React 19 exposes Suspense; TypeScript and the build verify it
import { lazy, Suspense } from 'react';
import { Activity, ConversationSurface, Heading, Page, Stack, Text } from '../../ui/kit/index.ts';
import { type Conversation, useChat } from './conversation.ts';
import type { Prompt } from './Chat.tsx';
export { createConversation, useConversation } from './conversation.ts';
export { openAIModel } from './model.ts';
export { ChatSettings } from './settings.tsx';
export type { Prompt } from './Chat.tsx';
const Chat = lazy(() => import('./Chat.tsx').then((module) => ({ default: module.Chat })));
export function ChatPanel({
  conversation,
  prompt = null,
  historyHref,
}: {
  conversation: Conversation;
  prompt?: Prompt | null;
  historyHref?: string;
}) {
  return (
    <Suspense fallback={<Text tone="subtle">Loading conversation…</Text>}>
      <Chat conversation={conversation} arg={prompt} historyHref={historyHref} />
    </Suspense>
  );
}
export function ChatPage({
  conversation,
  historyHref,
}: {
  conversation: Conversation;
  historyHref?: string;
}) {
  return (
    <Page>
      <Stack gap="xs">
        <Heading level={2}>Agent</Heading>
        <Text size="sm" tone="subtle">
          Your vault, in conversation
        </Text>
      </Stack>
      <ConversationSurface page={true}>
        <ChatPanel conversation={conversation} historyHref={historyHref} />
      </ConversationSurface>
    </Page>
  );
}
export function ChatIndicator({ conversation }: { conversation: Conversation }) {
  const { busy, unread } = useChat(conversation);
  return busy || unread ? (
    <Activity busy={busy} label={busy ? 'The agent is working' : 'The agent replied'} />
  ) : null;
}
