// The kit: the components every screen is made of. shadcn/ui's parts (parts/, from the shadcn CLI) and
// the kit's own pieces (app.tsx), all without className or style: an extension composes these and can't
// style anything, so every screen looks like the app (README.md).
import { unstyled } from './lib/unstyled.tsx';

import {
  AlertDescription as AlertDescriptionPart,
  Alert as AlertPart,
  AlertTitle as AlertTitlePart,
} from './parts/alert.tsx';
import { Badge as BadgePart } from './parts/badge.tsx';
import { Button as ButtonPart } from './parts/button.tsx';
import {
  CardAction as CardActionPart,
  CardContent as CardContentPart,
  CardDescription as CardDescriptionPart,
  CardFooter as CardFooterPart,
  CardHeader as CardHeaderPart,
  Card as CardPart,
  CardTitle as CardTitlePart,
} from './parts/card.tsx';
import { Checkbox as CheckboxPart } from './parts/checkbox.tsx';
import {
  CommandDialog as CommandDialogPart,
  CommandEmpty as CommandEmptyPart,
  CommandGroup as CommandGroupPart,
  CommandInput as CommandInputPart,
  CommandItem as CommandItemPart,
  CommandList as CommandListPart,
  Command as CommandPart,
  CommandSeparator as CommandSeparatorPart,
  CommandShortcut as CommandShortcutPart,
} from './parts/command.tsx';
import {
  DialogClose as DialogClosePart,
  DialogContent as DialogContentPart,
  DialogDescription as DialogDescriptionPart,
  DialogFooter as DialogFooterPart,
  DialogHeader as DialogHeaderPart,
  Dialog as DialogPart,
  DialogTitle as DialogTitlePart,
  DialogTrigger as DialogTriggerPart,
} from './parts/dialog.tsx';
import {
  DrawerClose as DrawerClosePart,
  DrawerContent as DrawerContentPart,
  DrawerDescription as DrawerDescriptionPart,
  DrawerFooter as DrawerFooterPart,
  DrawerHeader as DrawerHeaderPart,
  Drawer as DrawerPart,
  DrawerTitle as DrawerTitlePart,
  DrawerTrigger as DrawerTriggerPart,
} from './parts/drawer.tsx';
import {
  DropdownMenuCheckboxItem as DropdownMenuCheckboxItemPart,
  DropdownMenuContent as DropdownMenuContentPart,
  DropdownMenuGroup as DropdownMenuGroupPart,
  DropdownMenuItem as DropdownMenuItemPart,
  DropdownMenuLabel as DropdownMenuLabelPart,
  DropdownMenu as DropdownMenuPart,
  DropdownMenuRadioGroup as DropdownMenuRadioGroupPart,
  DropdownMenuRadioItem as DropdownMenuRadioItemPart,
  DropdownMenuSeparator as DropdownMenuSeparatorPart,
  DropdownMenuShortcut as DropdownMenuShortcutPart,
  DropdownMenuSubContent as DropdownMenuSubContentPart,
  DropdownMenuSub as DropdownMenuSubPart,
  DropdownMenuSubTrigger as DropdownMenuSubTriggerPart,
  DropdownMenuTrigger as DropdownMenuTriggerPart,
} from './parts/dropdown-menu.tsx';
import {
  EmptyContent as EmptyContentPart,
  EmptyDescription as EmptyDescriptionPart,
  EmptyHeader as EmptyHeaderPart,
  EmptyMedia as EmptyMediaPart,
  Empty as EmptyPart,
  EmptyTitle as EmptyTitlePart,
} from './parts/empty.tsx';
import {
  FieldContent as FieldContentPart,
  FieldDescription as FieldDescriptionPart,
  FieldError as FieldErrorPart,
  FieldGroup as FieldGroupPart,
  FieldLabel as FieldLabelPart,
  FieldLegend as FieldLegendPart,
  Field as FieldPart,
  FieldSeparator as FieldSeparatorPart,
  FieldSet as FieldSetPart,
  FieldTitle as FieldTitlePart,
} from './parts/field.tsx';
import { Input as InputPart } from './parts/input.tsx';
import {
  InputGroupAddon as InputGroupAddonPart,
  InputGroupButton as InputGroupButtonPart,
  InputGroupInput as InputGroupInputPart,
  InputGroup as InputGroupPart,
  InputGroupTextarea as InputGroupTextareaPart,
  InputGroupText as InputGroupTextPart,
} from './parts/input-group.tsx';
import {
  ItemActions as ItemActionsPart,
  ItemContent as ItemContentPart,
  ItemDescription as ItemDescriptionPart,
  ItemFooter as ItemFooterPart,
  ItemHeader as ItemHeaderPart,
  ItemMedia as ItemMediaPart,
  ItemSeparator as ItemSeparatorPart,
  ItemTitle as ItemTitlePart,
} from './parts/item.tsx';
import { Label as LabelPart } from './parts/label.tsx';
import { ScrollArea as ScrollAreaPart } from './parts/scroll-area.tsx';
import { Separator as SeparatorPart } from './parts/separator.tsx';
import {
  SheetClose as SheetClosePart,
  SheetContent as SheetContentPart,
  SheetDescription as SheetDescriptionPart,
  SheetFooter as SheetFooterPart,
  SheetHeader as SheetHeaderPart,
  Sheet as SheetPart,
  SheetTitle as SheetTitlePart,
  SheetTrigger as SheetTriggerPart,
} from './parts/sheet.tsx';
import {
  SidebarContent as SidebarContentPart,
  SidebarFooter as SidebarFooterPart,
  SidebarGroupAction as SidebarGroupActionPart,
  SidebarGroupContent as SidebarGroupContentPart,
  SidebarGroupLabel as SidebarGroupLabelPart,
  SidebarGroup as SidebarGroupPart,
  SidebarHeader as SidebarHeaderPart,
  SidebarInset as SidebarInsetPart,
  SidebarMenuAction as SidebarMenuActionPart,
  SidebarMenuBadge as SidebarMenuBadgePart,
  SidebarMenuButton as SidebarMenuButtonPart,
  SidebarMenuItem as SidebarMenuItemPart,
  SidebarMenuSkeleton as SidebarMenuSkeletonPart,
  SidebarMenuSubButton as SidebarMenuSubButtonPart,
  SidebarMenuSubItem as SidebarMenuSubItemPart,
  SidebarMenuSub as SidebarMenuSubPart,
  SidebarProvider as SidebarProviderPart,
  SidebarSeparator as SidebarSeparatorPart,
  SidebarTrigger as SidebarTriggerPart,
} from './parts/sidebar.tsx';
import { Skeleton as SkeletonPart } from './parts/skeleton.tsx';
import { Toaster as ToasterPart } from './parts/sonner.tsx';
import {
  TabsContent as TabsContentPart,
  TabsList as TabsListPart,
  Tabs as TabsPart,
  TabsTrigger as TabsTriggerPart,
} from './parts/tabs.tsx';
import { Textarea as TextareaPart } from './parts/textarea.tsx';
import {
  ToggleGroupItem as ToggleGroupItemPart,
  ToggleGroup as ToggleGroupPart,
} from './parts/toggle-group.tsx';
import {
  TooltipContent as TooltipContentPart,
  Tooltip as TooltipPart,
  TooltipProvider as TooltipProviderPart,
  TooltipTrigger as TooltipTriggerPart,
} from './parts/tooltip.tsx';

export const Alert = unstyled(AlertPart);
export const AlertTitle = unstyled(AlertTitlePart);
export const AlertDescription = unstyled(AlertDescriptionPart);
export const Badge = unstyled(BadgePart);
export const Button = unstyled(ButtonPart);
export const Card = unstyled(CardPart);
export const CardHeader = unstyled(CardHeaderPart);
export const CardFooter = unstyled(CardFooterPart);
export const CardTitle = unstyled(CardTitlePart);
export const CardAction = unstyled(CardActionPart);
export const CardDescription = unstyled(CardDescriptionPart);
export const CardContent = unstyled(CardContentPart);
export const Checkbox = unstyled(CheckboxPart);
export const Command = unstyled(CommandPart);
export const CommandDialog = unstyled(CommandDialogPart);
export const CommandInput = unstyled(CommandInputPart);
export const CommandList = unstyled(CommandListPart);
export const CommandEmpty = unstyled(CommandEmptyPart);
export const CommandGroup = unstyled(CommandGroupPart);
export const CommandItem = unstyled(CommandItemPart);
export const CommandShortcut = unstyled(CommandShortcutPart);
export const CommandSeparator = unstyled(CommandSeparatorPart);
export const Dialog = unstyled(DialogPart);
export const DialogClose = unstyled(DialogClosePart);
export const DialogContent = unstyled(DialogContentPart);
export const DialogDescription = unstyled(DialogDescriptionPart);
export const DialogFooter = unstyled(DialogFooterPart);
export const DialogHeader = unstyled(DialogHeaderPart);
export const DialogTitle = unstyled(DialogTitlePart);
export const DialogTrigger = unstyled(DialogTriggerPart);
export const Drawer = unstyled(DrawerPart);
export const DrawerTrigger = unstyled(DrawerTriggerPart);
export const DrawerClose = unstyled(DrawerClosePart);
export const DrawerContent = unstyled(DrawerContentPart);
export const DrawerHeader = unstyled(DrawerHeaderPart);
export const DrawerFooter = unstyled(DrawerFooterPart);
export const DrawerTitle = unstyled(DrawerTitlePart);
export const DrawerDescription = unstyled(DrawerDescriptionPart);
export const DropdownMenu = unstyled(DropdownMenuPart);
export const DropdownMenuTrigger = unstyled(DropdownMenuTriggerPart);
export const DropdownMenuContent = unstyled(DropdownMenuContentPart);
export const DropdownMenuGroup = unstyled(DropdownMenuGroupPart);
export const DropdownMenuLabel = unstyled(DropdownMenuLabelPart);
export const DropdownMenuItem = unstyled(DropdownMenuItemPart);
export const DropdownMenuCheckboxItem = unstyled(DropdownMenuCheckboxItemPart);
export const DropdownMenuRadioGroup = unstyled(DropdownMenuRadioGroupPart);
export const DropdownMenuRadioItem = unstyled(DropdownMenuRadioItemPart);
export const DropdownMenuSeparator = unstyled(DropdownMenuSeparatorPart);
export const DropdownMenuShortcut = unstyled(DropdownMenuShortcutPart);
export const DropdownMenuSub = unstyled(DropdownMenuSubPart);
export const DropdownMenuSubTrigger = unstyled(DropdownMenuSubTriggerPart);
export const DropdownMenuSubContent = unstyled(DropdownMenuSubContentPart);
export const Empty = unstyled(EmptyPart);
export const EmptyHeader = unstyled(EmptyHeaderPart);
export const EmptyTitle = unstyled(EmptyTitlePart);
export const EmptyDescription = unstyled(EmptyDescriptionPart);
export const EmptyContent = unstyled(EmptyContentPart);
export const EmptyMedia = unstyled(EmptyMediaPart);
export const Input = unstyled(InputPart);
export const Field = unstyled(FieldPart);
export const FieldContent = unstyled(FieldContentPart);
export const FieldDescription = unstyled(FieldDescriptionPart);
export const FieldError = unstyled(FieldErrorPart);
export const FieldGroup = unstyled(FieldGroupPart);
export const FieldLabel = unstyled(FieldLabelPart);
export const FieldLegend = unstyled(FieldLegendPart);
export const FieldSeparator = unstyled(FieldSeparatorPart);
export const FieldSet = unstyled(FieldSetPart);
export const FieldTitle = unstyled(FieldTitlePart);
export const InputGroup = unstyled(InputGroupPart);
export const InputGroupAddon = unstyled(InputGroupAddonPart);
export const InputGroupButton = unstyled(InputGroupButtonPart);
export const InputGroupInput = unstyled(InputGroupInputPart);
export const InputGroupText = unstyled(InputGroupTextPart);
export const InputGroupTextarea = unstyled(InputGroupTextareaPart);
export const Label = unstyled(LabelPart);
export const Textarea = unstyled(TextareaPart);
export const Toaster = unstyled(ToasterPart);
export const ItemMedia = unstyled(ItemMediaPart);
export const ItemContent = unstyled(ItemContentPart);
export const ItemActions = unstyled(ItemActionsPart);
export const ItemSeparator = unstyled(ItemSeparatorPart);
export const ItemTitle = unstyled(ItemTitlePart);
export const ItemDescription = unstyled(ItemDescriptionPart);
export const ItemHeader = unstyled(ItemHeaderPart);
export const ItemFooter = unstyled(ItemFooterPart);
export const ScrollArea = unstyled(ScrollAreaPart);
export const Separator = unstyled(SeparatorPart);
export const Sheet = unstyled(SheetPart);
export const SheetTrigger = unstyled(SheetTriggerPart);
export const SheetClose = unstyled(SheetClosePart);
export const SheetContent = unstyled(SheetContentPart);
export const SheetHeader = unstyled(SheetHeaderPart);
export const SheetFooter = unstyled(SheetFooterPart);
export const SheetTitle = unstyled(SheetTitlePart);
export const SheetDescription = unstyled(SheetDescriptionPart);
export const SidebarContent = unstyled(SidebarContentPart);
export const SidebarFooter = unstyled(SidebarFooterPart);
export const SidebarGroup = unstyled(SidebarGroupPart);
export const SidebarGroupAction = unstyled(SidebarGroupActionPart);
export const SidebarGroupContent = unstyled(SidebarGroupContentPart);
export const SidebarGroupLabel = unstyled(SidebarGroupLabelPart);
export const SidebarHeader = unstyled(SidebarHeaderPart);
export const SidebarInset = unstyled(SidebarInsetPart);
export const SidebarMenuAction = unstyled(SidebarMenuActionPart);
export const SidebarMenuBadge = unstyled(SidebarMenuBadgePart);
export const SidebarMenuButton = unstyled(SidebarMenuButtonPart);
export const SidebarMenuItem = unstyled(SidebarMenuItemPart);
export const SidebarMenuSkeleton = unstyled(SidebarMenuSkeletonPart);
export const SidebarMenuSub = unstyled(SidebarMenuSubPart);
export const SidebarMenuSubButton = unstyled(SidebarMenuSubButtonPart);
export const SidebarMenuSubItem = unstyled(SidebarMenuSubItemPart);
export const SidebarProvider = unstyled(SidebarProviderPart);
export const SidebarSeparator = unstyled(SidebarSeparatorPart);
export const SidebarTrigger = unstyled(SidebarTriggerPart);
export const Skeleton = unstyled(SkeletonPart);
export const Tabs = unstyled(TabsPart);
export const TabsList = unstyled(TabsListPart);
export const TabsTrigger = unstyled(TabsTriggerPart);
export const TabsContent = unstyled(TabsContentPart);
export const ToggleGroup = unstyled(ToggleGroupPart);
export const ToggleGroupItem = unstyled(ToggleGroupItemPart);
export const Tooltip = unstyled(TooltipPart);
export const TooltipTrigger = unstyled(TooltipTriggerPart);
export const TooltipContent = unstyled(TooltipContentPart);
export const TooltipProvider = unstyled(TooltipProviderPart);

export { toast } from 'sonner';
export {
  Avatar,
  Brand,
  Chip,
  type Choice,
  Choices,
  Cite,
  Columns,
  Count,
  DesktopMain,
  Details,
  Dot,
  type Gap,
  Heading,
  Item,
  ItemGroup,
  Kbd,
  KeyHint,
  Link,
  List,
  ListDetail,
  ListItem,
  Mark,
  MobileBar,
  MobileFrame,
  Notice,
  Overlay,
  Page,
  Panel,
  Prose,
  Recording,
  MobileActionButton,
  Row,
  SearchButton,
  Sidebar,
  SidebarMenu,
  SourceLabel,
  Sources,
  Spacer,
  Stack,
  Text,
  type TextProps,
  Timeline,
  TimelineItem,
  type Tone,
} from './app.tsx';
export { Bars, type BarsProps, Sparkline, type SparklineProps } from './chart.tsx';
export { CodeDiff, type CodeDiffProps } from './diff.tsx';
export { useIsMobile } from './hooks/use-mobile.ts';
export { Icon, type IconName, type IconProps, iconNames } from './icons.tsx';
export type { Unstyled } from './lib/unstyled.tsx';
export { type LatLon, type MapPoint, type MapRoute, MapView, type MapViewProps } from './map.tsx';
export { useSidebar } from './parts/sidebar.tsx';
export { startTheme, setTheme, type Theme, ThemeSwitch, useTheme } from './theme.tsx';
export {
  Activity,
  Composer,
  ComposerActions,
  ComposerSuggestions,
  ConversationFeed,
  ConversationPage,
  ConversationSurface,
  ConversationWelcome,
  Gate,
  HoverPreview,
  Json,
  Markdown,
  Message,
  PreviewBar,
  SidePanel,
  ToolResult,
  UnifiedDiff,
} from './surfaces.tsx';
export { DictateButton } from './dictation.tsx';
