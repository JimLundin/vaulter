import type { IconName } from '@/shared/ui/kit/index.ts';

// Already bound actions. Application chooses them; presentation displays them.
export interface Command {
  id: string;
  label: string;
  group: string;
  icon?: IconName;
  keys?: string;
  hidden?: boolean;
  run: () => void;
}
/** A place in the app. A destination (the default) is listed in the sidebar and the phone's menu sheet,
 * a list that may grow without limit; an action is one of the few controls every screen keeps, at the
 * sidebar's foot and in the phone's bottom bar. */
export interface Navigation {
  label: string;
  href: string;
  icon?: IconName;
  kind?: 'destination' | 'action';
  /** Prominent utilities share the brand's action area. */
  placement?: 'status' | 'header' | 'footer';
  /** An action can open a menu over the current destination instead of following its href. */
  onSelect?: () => void;
  current?: boolean;
  expanded?: boolean;
}
