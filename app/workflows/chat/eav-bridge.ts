import type { TransactionStore, TransactionRequest } from '@/vault/transactions/store.ts';
import { nodeOperations } from '@/vault/nodes/operations.ts';

/** Immutable evidence for consumers that still require Node addresses and exact versions. */
export async function publishChatEvidence(options: {
  readonly nodes: TransactionStore;
  readonly submission: string;
  readonly conversation: string;
  readonly role: 'user' | 'agent';
  readonly text: string;
  readonly at: string;
  readonly author: string;
  readonly origin: string;
  readonly pending: (request: TransactionRequest<unknown>) => void;
}) {
  const node = `eav-message:${options.submission}:${options.role}`;
  const existing = (await options.nodes.snapshot()).get(node);
  if (existing) {
    if (existing.data?.system !== 'eav' || existing.data.text !== options.text)
      throw new Error('EAV evidence address was reused');
    return;
  }
  using writes = options.nodes
    .writer({ recordedBy: options.author, origin: options.origin })
    .lifetime();
  const request = writes.write(() => ({
    value: undefined,
    transaction: {
      kind: nodeOperations.create,
      message: null,
      undoOf: null,
      changes: [
        {
          node,
          expected: null,
          placement: null,
          connection: null,
          data: {
            kind: 'externalRecord',
            system: 'eav',
            type: 'chat.message',
            submission: options.submission,
            conversation: options.conversation,
            role: options.role,
            text: options.text,
            at: options.at,
          },
        },
      ],
    },
  }));
  options.pending(request);
  await request.result;
}
