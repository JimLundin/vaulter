import type { NodeVersion } from '../../nodes/model.ts';
import type { NodeDifference } from '../../nodes/store.ts';
import type { NodeHistoryEntry } from './nodes.ts';

export interface NodeHistorySource {
  readonly entries: (options?: {
    readonly beforeSequence?: number;
    readonly limit?: number;
  }) => Promise<readonly NodeHistoryEntry[]>;
  readonly subscribe: (listener: () => void) => () => void;
  readonly canUndo?: (entry: NodeHistoryEntry) => boolean;
  readonly undo?: (entry: NodeHistoryEntry) => Promise<unknown>;
}

export interface HistoryEntry {
  readonly key: string;
  readonly title: string;
  readonly recordedAt: string;
  readonly sequence: number;
  readonly author?: string;
  readonly origin?: string;
  readonly details: readonly string[];
  readonly changes?: readonly {
    readonly title: string;
    readonly fields: readonly {
      readonly label: string;
      readonly before: string;
      readonly after: string;
    }[];
  }[];
  readonly undo?: () => Promise<unknown>;
}
export interface HistorySource {
  readonly entries: (options?: {
    readonly before?: string;
    readonly limit?: number;
  }) => Promise<readonly HistoryEntry[]>;
  readonly subscribe: (listener: () => void) => () => void;
}

/** A version's readable name: its first common label field, else its identity. */
export function labelOf(version: NodeVersion | null | undefined): string {
  const data = version?.data;
  for (const field of ['title', 'name', 'label', 'what', 'text', 'url', 'key'] as const) {
    const value = data?.[field];
    if (typeof value === 'string' && value.trim())
      return value.trim().split('\n')[0]!.slice(0, 120);
  }
  return version?.key.node ?? '';
}
export function describe({ before, after }: NodeDifference): string {
  const action =
    before === null
      ? 'Created'
      : after.data === null
        ? 'Deleted'
        : before.data === null
          ? 'Restored'
          : 'Updated';
  const kind = String((after.data ?? before?.data)?.kind ?? 'node');
  return `${action} ${kind}: ${labelOf(after.data ? after : before)}`;
}
export function nodeHistoryEntry(
  entry: NodeHistoryEntry,
  undo?: () => Promise<unknown>,
): HistoryEntry {
  const { transaction } = entry;
  return {
    key: `node:${transaction.id}`,
    title:
      transaction.message?.split('\n')[0] || `${transaction.kind.scope}.${transaction.kind.action}`,
    recordedAt: transaction.recordedAt,
    sequence: transaction.sequence,
    author: labelOf(entry.author),
    origin: entry.origin ? labelOf(entry.origin) : undefined,
    details: [
      ...(transaction.message?.includes('\n')
        ? [transaction.message.split('\n').slice(1).join('\n').trim()]
        : []),
      ...entry.differences.map(describe),
    ],
    undo,
  };
}
