import type { HistoricalReference } from '@/core/store/index.ts';

export function evidence(entity: string, transaction = 'asked'): HistoricalReference {
  return {
    format: 'vaulter-eav-snapshot-v1',
    scope: 'test',
    journal: 'test',
    transaction,
    entity,
    type: 'questions.question',
  };
}
