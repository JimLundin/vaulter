import type { IconName } from './kit/index.ts';

// Already bound actions. Product chooses them; presentation displays them.
export interface Command {
  id: string;
  label: string;
  group: string;
  icon?: IconName;
  keys?: string;
  hidden?: boolean;
  run: () => void;
}
export interface Navigation {
  label: string;
  href: string;
  icon?: IconName;
}
