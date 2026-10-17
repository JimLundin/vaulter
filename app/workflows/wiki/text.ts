// Wiki owns the retained UTF-16 block grammar; other record owners supply their prose.
import type { NodeVersion } from '@/vault/nodes/model.ts';
import type { NodeSnapshot } from '@/vault/nodes/store.ts';
import type { SourceReader } from '@/vault/sources.ts';
import { wikiSchemas } from './records.ts';

export class UnsupportedSourceRecordError extends Error {
  constructor(kind: unknown) {
    super(`Unsupported source record: ${String(kind)}`);
    this.name = 'UnsupportedSourceRecordError';
  }
}

/** Definition-owned text works beneath foreign sources too; only page ancestry denotes Wiki. */
export function recordText(node: NodeVersion, view: NodeSnapshot, sources: SourceReader): string {
  const visit = (version: NodeVersion, path: Set<string>): string => {
    const key = JSON.stringify(version.key);
    if (!version.data || path.has(key)) return '';
    const { data } = version;
    const next = new Set(path).add(key);
    const textOf = (child: NodeVersion) => visit(child, next);
    if (!Object.hasOwn(wikiSchemas, String(data.kind))) {
      const text = sources.text(version, { view, textOf });
      if (text === undefined) throw new UnsupportedSourceRecordError(data.kind);
      return text;
    }
    if (data.kind === 'cite') return '';
    if (typeof data.text === 'string') return data.text;
    const children = view.children(version.key);
    if (data.kind === 'item') {
      const inline = children.filter((child) => ['run', 'link'].includes(String(child.data?.kind)));
      const blocks = children.filter(
        (child) => !['run', 'link', 'cite'].includes(String(child.data?.kind)),
      );
      return [inline.map(textOf).join(''), ...blocks.map(textOf)].filter(Boolean).join('\n');
    }
    const fragments = children.filter((child) => child.data?.kind !== 'cite').map(textOf);
    const separator = ['paragraph', 'heading', 'cell'].includes(String(data.kind))
      ? ''
      : data.kind === 'row'
        ? '\t'
        : '\n';
    return (data.kind === 'row' ? fragments : fragments.filter(Boolean)).join(separator);
  };
  return visit(node, new Set());
}
