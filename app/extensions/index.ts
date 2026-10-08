// The app's features, in the order their pages are tried (the first page that claims a path wins; notes
// claim any note's path, so they come last). A feature is a folder here and a line in this list.
import type { Extension } from '../core/extension.ts';
import { home } from './home/index.tsx';
import { topics } from './topics/index.tsx';
import { calendar } from './calendar/index.tsx';
import { map } from './map/index.tsx';
import { places } from './places/index.tsx';
import { decisions } from './decisions/index.tsx';
import { similar } from './similar/index.tsx';
import { editor } from './editor/index.tsx';
import { agent } from './agent/index.tsx';
import { audit } from './audit/index.tsx';
import { code } from './code/index.tsx';
import { web } from './web/index.tsx';
import { graph } from './graph/index.tsx';
import { notes } from './notes/index.tsx';

export const EXTENSIONS: Extension[] = [
  home,
  topics,
  calendar,
  map,
  places,
  decisions,
  similar,
  editor,
  agent,
  audit,
  code,
  web,
  graph,
  notes,
];
