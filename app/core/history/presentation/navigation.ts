import { historyRoute } from '@/core/history/routes.ts';
import type { Navigation, Command } from '@/core/navigation/index.ts';
export function historyNavigation(open: boolean, onSelect: () => void): Navigation {
  return {
    label: 'History',
    href: historyRoute.href(),
    icon: 'history',
    kind: 'action',
    placement: 'status',
    onSelect,
    current: open,
    expanded: open,
  };
}
export function historyCommand(run: () => void): Command {
  return {
    id: 'go.history',
    label: 'History',
    group: 'Application',
    icon: 'history',
    keys: 'g y',
    run,
  };
}
