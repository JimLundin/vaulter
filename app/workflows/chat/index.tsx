// biome-ignore lint/correctness/noUnresolvedImports: React 19 exposes Suspense; TypeScript and the build verify it
import { lazy, Suspense } from 'react';
import { Activity, ConversationPage, Text } from '../../ui/kit/index.ts';
import type { NodeConversation as Conversation } from './node-conversation.ts';
import { useNodeChat as useChat } from './use-node-conversation.ts';
import type { Prompt } from './Chat.tsx';
import type { Transcription } from './transcription.ts';
export {
  useNodeConversation as useConversation,
  useNodeChat as useChat,
} from './use-node-conversation.ts';
export { openAIModel } from './model.ts';
export { openAITranscription } from './openai-transcription.ts';
export { useVoiceDraft } from './dictation.ts';
export {
  useTranscription,
  useTranscript,
  type Transcription,
  type TranscriptionProvider,
} from './transcription.ts';
export { ChatSettings } from './settings.tsx';
export type { Prompt } from './Chat.tsx';
const Chat = lazy(() => import('./Chat.tsx').then((module) => ({ default: module.Chat })));
export function ChatPanel({
  conversation,
  prompt = null,
  historyHref,
  voice,
}: {
  conversation: Conversation;
  prompt?: Prompt | null;
  historyHref?: string;
  voice: Transcription;
}) {
  return (
    <Suspense fallback={<Text tone="subtle">Loading conversation…</Text>}>
      <Chat conversation={conversation} arg={prompt} historyHref={historyHref} voice={voice} />
    </Suspense>
  );
}
export function ChatPage({
  conversation,
  prompt = null,
  historyHref,
  voice,
}: {
  conversation: Conversation;
  prompt?: Prompt | null;
  historyHref?: string;
  voice: Transcription;
}) {
  return (
    <ConversationPage>
      <ChatPanel
        conversation={conversation}
        prompt={prompt}
        historyHref={historyHref}
        voice={voice}
      />
    </ConversationPage>
  );
}
export function ChatIndicator({ conversation }: { conversation: Conversation }) {
  const { busy, unread } = useChat(conversation);
  return busy || unread ? (
    <Activity busy={busy} label={busy ? 'The agent is working' : 'The agent replied'} />
  ) : null;
}
