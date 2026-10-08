// Notes in a view: the vault's vocabulary (meta/schema.yaml), from the host's files.
import { useHost } from '../../core/host.tsx';
import { NO_SCHEMA, schemaFor } from './model/schema.ts';

/** The vocabulary: types, areas, statuses, circles, predicates; empty while it can't be read. */
export const useSchema = () => {
  const s = schemaFor(useHost().files);
  return s instanceof Error ? NO_SCHEMA : s;
};
