import { settingsRoute } from '@/core/settings/routes.ts';
import type { Navigation, Command } from '@/core/navigation/index.ts';
export function settingsNavigation(open: boolean, onSelect: () => void): Navigation {
  return {
    label: 'Settings',
    href: settingsRoute.href(),
    icon: 'settings',
    kind: 'action',
    onSelect,
    current: open,
    expanded: open,
  };
}
export function settingsCommand(run: () => void): Command {
  return { id: 'go.settings', label: 'Settings', group: 'Application', icon: 'settings', run };
}
