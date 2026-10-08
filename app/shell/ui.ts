// The shell's own state, on the host so commands and views can drive it: which panel is open (and what
// it was opened with), search, the shortcuts list, and the sidebar. A docked panel and the sidebar keep
// their state per device.
import { useMemo, useState } from 'react';
import type { PanelArg } from './extension.ts';

const PANEL = 'vault-panel';
const SIDEBAR = 'vault-sidebar';

export interface Ui {
  panel: string | null;
  arg: PanelArg | null;
  openPanel: (id: string, prompt?: { text: string; send?: boolean }) => void;
  closePanel: () => void;
  togglePanel: (id: string) => void;
  search: boolean;
  setSearch: (open: boolean) => void;
  help: boolean;
  setHelp: (open: boolean) => void;
  sidebar: boolean;
  setSidebar: (open: boolean) => void;
}

export function useUi(): Ui {
  // A docked panel opens again where it was left; on a narrower screen it would cover the page.
  const [panel, setPanel] = useState<string | null>(() =>
    matchMedia('(min-width: 1280px)').matches ? localStorage.getItem(PANEL) : null,
  );
  const [arg, setArg] = useState<PanelArg | null>(null);
  const [search, setSearch] = useState(false);
  const [help, setHelp] = useState(false);
  const [sidebar, setSidebarState] = useState(() => localStorage.getItem(SIDEBAR) !== 'closed');
  return useMemo(() => {
    const show = (id: string | null) => {
      setPanel(id);
      if (id) localStorage.setItem(PANEL, id);
      else localStorage.removeItem(PANEL);
    };
    return {
      panel,
      arg,
      openPanel: (id, prompt) => {
        show(id);
        if (prompt) setArg((a) => ({ text: prompt.text, send: !!prompt.send, n: (a?.n ?? 0) + 1 }));
      },
      closePanel: () => show(null),
      togglePanel: (id) => show(panel === id ? null : id),
      search,
      setSearch,
      help,
      setHelp,
      sidebar,
      setSidebar: (open) => {
        setSidebarState(open);
        localStorage.setItem(SIDEBAR, open ? 'open' : 'closed');
      },
    };
  }, [panel, arg, search, help, sidebar]);
}
