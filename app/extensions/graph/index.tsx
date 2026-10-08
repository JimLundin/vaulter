// The graph: what the notes connect into (model/graph.ts), the links, backlinks, relations and topics every
// view of more than one note reads (useGraph), and its check: a write that leaves a link or a field naming
// a note that isn't there is refused.
import type { Extension } from '../../core/extension.ts';
import { graphFiles } from './model/problems.ts';

export const graph: Extension = {
  id: 'graph',
  files: graphFiles,
};
