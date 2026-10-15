// The icons extensions may use, by name: the design's stroke icons, from lucide (which shadcn uses).

import { cva } from 'class-variance-authority';
import {
  ArrowLeft,
  ArrowUp,
  ArrowUpRight,
  BookOpen,
  Calendar,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Clock,
  CornerDownLeft,
  Ellipsis,
  FileText,
  Footprints,
  GripVertical,
  History,
  House,
  Inbox,
  Keyboard,
  Lightbulb,
  List,
  ListFilter,
  LayoutGrid,
  type LucideIcon,
  Map as MapIcon,
  MapPin,
  Mic,
  Monitor,
  Moon,
  Network,
  Pause,
  Pencil,
  Play,
  Plus,
  Puzzle,
  RotateCcw,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Smartphone,
  Square,
  Sun,
  Trash2,
  TriangleAlert,
  User,
  X,
} from 'lucide-react';

const ICONS = {
  'arrow-left': ArrowLeft,
  'arrow-up': ArrowUp,
  'arrow-up-right': ArrowUpRight,
  enter: CornerDownLeft,
  book: BookOpen,
  network: Network,
  calendar: Calendar,
  check: Check,
  'chevron-left': ChevronLeft,
  'chevron-right': ChevronRight,
  help: CircleHelp,
  clock: Clock,
  more: Ellipsis,
  file: FileText,
  footprints: Footprints,
  grip: GripVertical,
  history: History,
  home: House,
  inbox: Inbox,
  keyboard: Keyboard,
  idea: Lightbulb,
  list: List,
  filter: ListFilter,
  grid: LayoutGrid,
  map: MapIcon,
  pin: MapPin,
  mic: Mic,
  pause: Pause,
  edit: Pencil,
  play: Play,
  plus: Plus,
  extension: Puzzle,
  undo: RotateCcw,
  search: Search,
  settings: Settings,
  shield: ShieldCheck,
  sparkles: Sparkles,
  mobile: Smartphone,
  stop: Square,
  trash: Trash2,
  warning: TriangleAlert,
  person: User,
  close: X,
  system: Monitor,
  light: Sun,
  dark: Moon,
} satisfies Record<string, LucideIcon>;

export type IconName = keyof typeof ICONS;
export const iconNames = Object.keys(ICONS) as IconName[];

const size = cva('shrink-0', {
  variants: { size: { sm: 'size-3.5', md: 'size-4', lg: 'size-5', xl: 'size-7' } },
  defaultVariants: { size: 'md' },
});

export interface IconProps {
  name: IconName;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  /** Read out instead of hidden, when the icon stands alone. */
  label?: string;
}

export function Icon({ name, size: s, label }: IconProps) {
  const C = ICONS[name];
  return (
    <C
      className={size({ size: s })}
      strokeWidth={1.9}
      aria-hidden={label ? undefined : true}
      aria-label={label}
      role={label ? 'img' : undefined}
    />
  );
}
