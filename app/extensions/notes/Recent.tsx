// The sidebar's Recent: the notes opened lately on this device (core/recent.ts), the one on screen marked.
// Hidden when there are none, and when the sidebar is down to its icons.
import { useHost } from '../../shell/host.tsx';
import { useRecent } from '../../shell/recent.ts';
import { link, useRoute } from '../../shell/route.ts';
import { titleOf } from '../../../core/note-fields.ts';
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar.tsx';

const SHOWN = 8;

export function RecentSidebar() {
  const { vault } = useHost();
  const { path } = useRoute();
  const recent = useRecent()
    .flatMap((href) => {
      const note = vault.byHref.get(href);
      return note ? [{ href, note }] : [];
    })
    .slice(0, SHOWN);
  if (!recent.length) return null;
  return (
    <SidebarGroup className="group-data-[collapsible=icon]:hidden">
      <SidebarGroupLabel>Recent</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {recent.map(({ href, note }) => (
            <SidebarMenuItem key={href}>
              <SidebarMenuButton asChild={true} size="sm" isActive={href === path}>
                <a href={link(href)} className="text-sidebar-foreground/80 no-underline">
                  <span>{titleOf(note)}</span>
                </a>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
