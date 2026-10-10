// Permanent feature records over the common NodeStore; no feature-specific persistence backend.
import type { NodeAddress, NodeId, Transaction } from '../../../vault/nodes/model.ts';
import type { NodeChange, NodeStore } from '../../../vault/nodes/store.ts';
import type { ChatMetadataData, MetadataReferenceData } from './chat-metadata.ts';
import { parseMetadata, parseMetadataReference } from './chat-metadata-schema.ts';
import { chatOperations } from './chat.ts';

export interface MetadataEntry {
  readonly node: NodeId;
  readonly order: string;
  readonly data: ChatMetadataData;
  readonly references?: readonly {
    readonly node: NodeId;
    readonly order: string;
    readonly target: Required<NodeAddress>;
    readonly data: MetadataReferenceData;
  }[];
}

/** Caller retains transaction ID and entries for safe retries after uncertain remote acceptance. */
export function recordChatMetadata(
  store: NodeStore,
  options: {
    readonly transaction: string;
    readonly recordedBy: NodeId;
    readonly exchange: NodeId;
    readonly entries: readonly MetadataEntry[];
  },
): Promise<Transaction> {
  const changes: NodeChange[] = [];
  for (const entry of options.entries) {
    if (['agentRun', 'contextInput', 'toolExecution'].includes(entry.data.kind))
      throw new Error('Agent owns execution metadata; use Agent preparation and acceptance.');
    if (
      entry.data.kind === 'interpretation' &&
      !entry.references?.some((reference) => reference.data.role === 'evidence')
    )
      throw new Error('Interpretations require exact evidence');
    changes.push({
      node: entry.node,
      expected: null,
      data: parseMetadata(entry.data),
      placement: { parent: options.exchange, order: entry.order },
      connection: null,
    });
    for (const reference of entry.references ?? []) {
      if (!reference.target.transaction)
        throw new Error('Metadata references require exact versions');
      changes.push({
        node: reference.node,
        expected: null,
        data: parseMetadataReference(reference.data),
        placement: { parent: entry.node, order: reference.order },
        connection: {
          source: { node: entry.node, transaction: options.transaction },
          target: reference.target,
        },
      });
    }
  }
  return store.commit({
    id: options.transaction,
    recordedBy: options.recordedBy,
    origin: options.exchange,
    kind: chatOperations.recordMetadata,
    message: null,
    undoOf: null,
    changes,
  });
}
