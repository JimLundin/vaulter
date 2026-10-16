// biome-ignore-all lint/performance/noBarrelFile: The module has one public interface; implementation exports stay private.
export { e, SchemaMismatchError } from './schema.ts';
export { openDatabase } from './engine.ts';
export { createMemoryStorage, ConflictError } from './memory.ts';
export { sameEntity } from './identity.ts';
export { clear } from './types.ts';
export type { EntityRef } from './identity.ts';
export type { MemoryStorage } from './memory.ts';
export type { EntityDefinition, Registry, Schema } from './schema.ts';
export type {
  Database,
  ReadView,
  Transaction,
  TransactionRef,
  TransactionContext,
  Reader,
  Writer,
  Selection,
  Selected,
  Where,
  QueryOptions,
} from './types.ts';
export type { JsonValue } from './json.ts';
export {
  createPersistentStorage,
  SaveError,
  parseJournal,
  closeStorage,
  clearStorage,
} from './persistence.ts';
export type { StorageAdapter, Journal, AppendRequest } from './persistence.ts';
