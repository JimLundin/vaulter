// The agent: files Captures, answers from the vault, and commits on its own, following
// meta/conventions.md. A panel beside every page (mod+j, or "Ask the agent: …" in ⌘K), and #/agent/ for a
// link to it. Needs the sealed OpenAI key and a backend that can write. The chat view loads when it's
// opened (its components stay out of the main bundle), like the SDK it loads in turn.
// biome-ignore lint/correctness/noUnresolvedImports: Suspense is in @types/react's namespace, which Biome doesn't follow
import { lazy, Suspense } from 'react';
import { PlusIcon, SparklesIcon } from 'lucide-react';
import { cn } from 'cn';
import type { Extension, PanelArg } from '../../core/extension.ts';
import { useHost } from '../../core/host.tsx';
import { chat, newChat, useChat } from './chat.ts';
import { Loading } from '@/components/layout.tsx';

const Chat = lazy(() => import('./Agent.tsx').then((m) => ({ default: m.AgentChat })));

function AgentView({ arg }: { arg: PanelArg | null; close: () => void }) {
  return (
    <Suspense fallback={<Loading />}>
      <Chat arg={arg} />
    </Suspense>
  );
}

/** On the panel's button: busy (amber, pulsing), or a reply not read yet (green). Always on screen, it keeps the chat's
 * host current, so a turn runs on (and `send` works) with no chat open. */
function AgentIndicator() {
  chat.host = useHost();
  const { busy, unread } = useChat();
  if (!(busy || unread)) return null;
  return (
    <span
      role="status"
      aria-label={busy ? 'The agent is working' : 'The agent replied'}
      className={cn(
        'inline-block size-2.5 shrink-0 rounded-full ring-2 ring-background',
        busy ? 'animate-pulse bg-warning' : 'bg-success',
      )}
    />
  );
}

export const agent: Extension = {
  id: 'agent',
  page: (path) =>
    path === '/agent/'
      ? {
          title: 'Agent',
          body: (
            <div className="flex h-[calc(100svh-13rem)] min-h-96 flex-col rounded-xl border bg-background md:h-[calc(100svh-8rem)]">
              <AgentView arg={null} close={() => undefined} />
            </div>
          ),
        }
      : null,
  panel: {
    id: 'agent',
    label: 'Agent',
    icon: SparklesIcon,
    keys: 'mod+j',
    ask: true,
    when: (h) => !!h.secrets,
    view: AgentView,
    indicator: AgentIndicator,
  },
  commands: () => [
    {
      id: 'agent.ask',
      label: 'Ask the agent',
      group: 'Agent',
      icon: SparklesIcon,
      when: (h) => !!h.secrets,
      run: (h) => h.ui.openPanel('agent'),
    },
    {
      id: 'agent.new',
      label: 'New chat',
      group: 'Agent',
      icon: PlusIcon,
      when: (h) => !!h.secrets && chat.state.turns.length > 0 && !chat.state.busy,
      run: (h) => {
        newChat();
        h.ui.openPanel('agent');
      },
    },
  ],
};
