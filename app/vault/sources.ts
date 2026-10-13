// Shared reading values. Record owners interpret their payloads; consumers select historical views.
import type { NodeVersion } from './nodes/model.ts';
import type { NodeSnapshot } from './nodes/store.ts';

export interface SourceTextContext {
  readonly view: NodeSnapshot;
  readonly textOf: (node: NodeVersion) => string;
}
export interface SourceDescription {
  readonly title: string;
  readonly href?: string;
  readonly date?: string;
  readonly speaker?: 'user' | 'agent';
  /** The source owner recognizes a retained capture link as page provenance. */
  readonly capture?: boolean;
}
export interface SourceReader {
  /** Text stored in this exact version, without requiring a separate child Snapshot selection. */
  readonly exactText?: (node: NodeVersion, view: NodeSnapshot) => string | undefined;
  /** Empty text is supported non-prose; undefined means this owner does not interpret the record. */
  readonly text: (node: NodeVersion, context: SourceTextContext) => string | undefined;
  /** Describe only directly owned records; describeSource supplies inherited passage attribution. */
  readonly describe: (node: NodeVersion, view: NodeSnapshot) => SourceDescription | undefined;
}

/** Select the nearest source owner without interpreting any payload outside that owner.
 * A nested passage inherits attribution, while capture provenance belongs to a direct source link. */
export function describeSource(
  node: NodeVersion,
  view: NodeSnapshot,
  readers: readonly SourceReader[],
): SourceDescription | undefined {
  let current: NodeVersion | undefined = node;
  const seen = new Set<string>();
  while (current?.data && !seen.has(current.key.node)) {
    seen.add(current.key.node);
    for (const reader of readers) {
      const description = reader.describe(current, view);
      if (description !== undefined)
        return current === node ? description : { ...description, capture: false };
    }
    current = current.placement ? view.get(current.placement.parent) : undefined;
  }
  return undefined;
}
