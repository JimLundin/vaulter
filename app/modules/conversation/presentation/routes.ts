import { definePage } from '@/core/navigation/index.ts';
import { ChatPage } from './pages.tsx';
import { chatRoute } from '@/modules/conversation/routes.ts';
export const chatPage = definePage({
  patterns: [chatRoute, { match: (path: string) => (path === '/' ? {} : null) }],
  component: ChatPage,
  destination: { label: 'Chat', href: chatRoute.href(), icon: 'sparkles' },
  command: { id: 'go.chat', keys: 'g h' },
});
