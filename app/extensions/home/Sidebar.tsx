// Home's group in the sidebar: every area (its colour, its hub or its tab on Home), opening to what in
// it is active now. Collapsed to icons, an area is its initial in its colour, named by a tooltip.
import { ChevronRightIcon } from 'lucide-react';
import { cn } from 'cn';
import { titleOf, hrefOf } from '../notes/model/fields.ts';
import { useVault } from '../../core/host.tsx';
import { link, useRoute } from '../../core/route.ts';
import { areaHref, home } from './data.ts';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible.tsx';
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from '@/components/ui/sidebar.tsx';

const MAX = 6;

export function AreasSidebar() {
  const { areas } = home(useVault());
  const { path, anchor } = useRoute();
  const shown = areas.filter((a) => a.notes.length);
  if (!shown.length) return null;
  return (
    <SidebarGroup>
      <SidebarGroupLabel>Areas</SidebarGroupLabel>
      <SidebarMenu>
        {shown.map((a) => {
          const href = areaHref(a);
          const here = (path === '/' && anchor === a.key) || (!!a.hub && path === hrefOf(a.hub));
          const within = a.active.slice(0, MAX).some((n) => hrefOf(n) === path);
          return (
            <Collapsible key={a.key} asChild={true} defaultOpen={within}>
              <SidebarMenuItem>
                <SidebarMenuButton asChild={true} tooltip={a.label} isActive={here}>
                  <a
                    href={link(href)}
                    className={cn('text-sidebar-foreground no-underline', `a-${a.key}`)}
                  >
                    <span className="flex size-4 shrink-0 items-center justify-center">
                      <span className="size-2.5 rounded-full bg-(--c) group-data-[collapsible=icon]:hidden" />
                      <span className="hidden text-sm font-bold text-(--c) group-data-[collapsible=icon]:inline">
                        {a.label[0]}
                      </span>
                    </span>
                    <span>{a.label}</span>
                  </a>
                </SidebarMenuButton>
                {a.active.length > 0 && (
                  <>
                    <CollapsibleTrigger asChild={true}>
                      <SidebarMenuAction
                        className="transition-transform data-[state=open]:rotate-90"
                        aria-label={`${a.label}: what's active`}
                      >
                        <ChevronRightIcon />
                      </SidebarMenuAction>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <SidebarMenuSub>
                        {a.active.slice(0, MAX).map((n) => (
                          <SidebarMenuSubItem key={n.id}>
                            <SidebarMenuSubButton
                              asChild={true}
                              size="sm"
                              isActive={hrefOf(n) === path}
                            >
                              <a href={link(hrefOf(n))} className="no-underline">
                                <span>{titleOf(n)}</span>
                              </a>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        ))}
                        {a.active.length > MAX && (
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton asChild={true} size="sm">
                              <a href={link(`/#${a.key}`)} className="text-faint no-underline">
                                <span>{a.active.length - MAX} more…</span>
                              </a>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        )}
                      </SidebarMenuSub>
                    </CollapsibleContent>
                  </>
                )}
              </SidebarMenuItem>
            </Collapsible>
          );
        })}
      </SidebarMenu>
    </SidebarGroup>
  );
}
