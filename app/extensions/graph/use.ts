// The graph in a view: of the host's files (with staged edits), computed once per files.
import { useHost } from '../../core/host.tsx';
import { graphOf } from './model/graph.ts';

export const useGraph = () => graphOf(useHost().files);
