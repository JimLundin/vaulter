// Home: the Home note as the lede over a dashboard of the vault's own sections (Home.tsx), with the
// areas in the sidebar and as commands ("Go to area: Work").
import type { Extension } from '../../core/extension.ts';
import { go } from '../../core/route.ts';
import { HomePage } from './Home.tsx';
import { AreasSidebar } from './Sidebar.tsx';
import { areaHref, home as homeData } from './data.ts';
import { graphOf } from '../graph/model/graph.ts';

export const home: Extension = {
  id: 'home',
  page(path, host) {
    const vault = graphOf(host.files);
    const note = vault.byId.get('Home');
    if (path !== '/' || !note) return null;
    return { title: 'Home', width: 'wide', body: <HomePage note={note} /> };
  },
  sidebar: [{ order: 10, view: AreasSidebar }],
  commands: (host) =>
    homeData(graphOf(host.files))
      .areas.filter((a) => a.notes.length)
      .map((a) => ({
        id: `home.area.${a.key}`,
        label: `Go to area: ${a.label}`,
        group: 'Areas',
        run: () => go(areaHref(a)),
      })),
};
