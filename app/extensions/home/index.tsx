// Home: the Home note, then the sections every extension adds to it; these are the vault's own.
import type { Extension } from '../../core/extension.ts';
import { HomeSections } from '../../core/host.tsx';
import { NoteBody } from '../notes/NotePage.tsx';
import {
  Today,
  InFocus,
  Recent,
  Areas,
  People,
  Untagged,
  AllOpenQuestions,
  DailyLog,
} from './Home.tsx';
import './home.css';

export const home: Extension = {
  id: 'home',
  page(path, { vault }) {
    const note = vault.byId.get('Home');
    if (path !== '/' || !note) return null;
    return {
      title: 'Home',
      body: (
        <>
          <NoteBody note={note} />
          <div className="v-dash">
            <div className="dash">
              <HomeSections />
            </div>
          </div>
        </>
      ),
    };
  },
  homeSections: [
    { order: 10, view: Today },
    { order: 20, view: InFocus },
    { order: 30, view: Recent },
    { order: 40, view: Areas },
    { order: 50, view: People },
    { order: 60, view: Untagged },
    { order: 70, view: AllOpenQuestions },
    { order: 80, view: DailyLog },
  ],
};
