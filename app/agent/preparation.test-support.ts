import type { NodeStore } from '@/vault/nodes/store.ts';
import type { TransactionStore } from '@/vault/transactions/store.ts';
import {
  currentTransactionsFixture,
  writeLifetimeFixture,
} from '@/vault/transactions/fixtures.test-support.ts';
import {
  calculateAgentRun,
  prepareAgentRun,
  readAgentRun,
  type AgentStartOptions,
  type AgentRunPlan,
} from './store.ts';

/** Fixture labels identify runs; transaction identity is always allocated by the real core. */
export async function prepareAgentRunFixture(
  nodes: NodeStore | TransactionStore,
  options: AgentStartOptions,
  compose?: (plan: AgentRunPlan) => AgentRunPlan,
) {
  const { id: _label, recordedBy, origin = null, ...calculation } = options;
  const lifetime = writeLifetimeFixture(nodes, { recordedBy, origin });
  if (!compose) return prepareAgentRun(lifetime, calculation);
  const publication = lifetime.prepare(async ({ id, nodes: reading }) => {
    const value = compose(
      await calculateAgentRun(reading, { ...calculation, id, recordedBy, origin }),
    );
    return { value, transaction: value.commit };
  });
  return { ...(await publication.ready), publication, cancel: lifetime.close };
}

export const readAgentRunFixture = (
  nodes: NodeStore | TransactionStore,
  run: string,
  sequence?: number,
) => readAgentRun(currentTransactionsFixture(nodes), run, sequence);
