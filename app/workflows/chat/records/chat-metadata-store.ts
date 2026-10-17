// Permanent feature records over the common NodeStore; no feature-specific persistence backend.
import type { NodeAddress, NodeId } from '@/vault/nodes/model.ts';
import type { NodeChange } from '@/vault/nodes/store.ts';
import type { ChatMetadataData, MetadataReferenceData } from './chat-metadata.ts';
import { parseMetadata, parseMetadataReference } from './chat-metadata-schema.ts';
import { chatOperations } from './chat.ts';
import type { TransactionRequest, WriteLifetime } from '@/vault/transactions/store.ts';

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

/** The returned core request retains exact metadata references for persistence recovery. */
export function recordChatMetadata(
  lifetime: WriteLifetime,
  options: {
    readonly entries: readonly MetadataEntry[];
  },
): TransactionRequest<void> {
  return lifetime.write(({ id, origin }) => {
    if (!origin) throw new Error('Chat metadata requires an Exchange origin.');
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
        placement: { parent: origin, order: entry.order },
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
            source: { node: entry.node, transaction: id },
            target: reference.target,
          },
        });
      }
    }
    return {
      value: undefined,
      transaction: {
        kind: chatOperations.recordMetadata,
        message: null,
        undoOf: null,
        changes,
      },
    };
  });
}
