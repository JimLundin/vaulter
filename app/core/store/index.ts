// biome-ignore-all lint/performance/noBarrelFile: The module has one public interface; implementation exports stay private.
export { e, SchemaMismatchError } from './schema.ts';
export { openDatabase } from './engine.ts';
export { createMemoryStorage, ConflictError } from './memory.ts';
export { sameEntity } from './identity.ts';
export { clear } from './types.ts';
export { DEFAULT_QUERY_LIMIT } from './query.ts';
export type { EntityRef } from './identity.ts';
export type { JournalStorage } from './memory.ts';
export type { EntityDefinition, Registry, Schema } from './schema.ts';
export type {
  Database,
  DomainDatabase,
  ReadView,
  Transaction,
  TransactionRef,
  HistoricalReference,
  TransactionContext,
  Reader,
  Writer,
  Selection,
  Selected,
  Where,
  QueryOptions,
  TransactionChange,
} from './types.ts';
export { canonical, frozen, digest, compare } from './json.ts';
export type { JsonValue, JsonObject } from './json.ts';
export {
  createPersistentStorage,
  SaveError,
  parseJournal,
  closeStorage,
  clearStorage,
  cachedStorage,
  refreshStorage,
  suspendStorage,
  drainStorage,
} from './persistence.ts';
export type { StorageAdapter, Journal, AppendRequest } from './persistence.ts';
