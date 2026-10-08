// Home: the Home note as the lede over a dashboard of the vault's own sections (Home.tsx), with the
// areas in the sidebar and as commands ("Go to area: Work").
import type { Extension } from '../../shell/extension.ts';
import { go } from '../../shell/route.ts';
import { HomePage } from './Home.tsx';
import { AreasSidebar } from './Sidebar.tsx';
import { areaHref, home as homeData } from './data.ts';

export const home: Extension = {
  id: 'home',
  page(path, { vault }) {
    const note = vault.byId.get('Home');
    if (path !== '/' || !note) return null;
    return { title: 'Home', width: 'wide', body: <HomePage note={note} /> };
  },
  sidebar: [{ order: 10, view: AreasSidebar }],
  commands: ({ vault }) =>
    homeData(vault)
      .areas.filter((a) => a.notes.length)
      .map((a) => ({
        id: `home.area.${a.key}`,
        label: `Go to area: ${a.label}`,
        group: 'Areas',
        run: () => go(areaHref(a)),
      })),
};
