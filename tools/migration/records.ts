// The shapes the migration works in: record payloads as plain JSON, references not yet resolved,
// node specifications, and safe readers for parsed YAML.
import type { JsonObject, JsonValue } from '../../app/vault/nodes/model.ts';

/** A record payload under construction: its kind and its fields, all plain JSON. */
export interface Data {
  kind: string;
  [field: string]: JsonValue;
}

/** A reference as the source wrote it, resolved against the vault at each revision. */
export type Ref =
  | { page: string } // a page name or alias
  | { path: string; anchor?: string } // an internal link
  | { resource: string }
  | { term: string }
  | { node: string };

/** A node as one revision of the vault describes it, keyed by its identity key. */
export interface Spec {
  data: Data;
  parent: string | null;
  order: string;
  target?: Ref;
  /** The identity key the reference resolved to at this revision. */
  resolvedTarget?: string;
  /** An exact reference, fixed when first recorded. */
  exact?: {
    source: [key: string, transaction: string];
    target: [key: string, transaction: string];
  };
}
export type Specs = Map<string, Spec>;

/** Parsed YAML as JSON: dates and other non-JSON values become their JSON form. */
export const json = (value: unknown): JsonValue =>
  value === undefined ? null : (JSON.parse(JSON.stringify(value)) as JsonValue);
export const asObject = (value: JsonValue | undefined): JsonObject =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as JsonObject) : {};
export const list = (value: JsonValue | undefined): readonly JsonValue[] =>
  Array.isArray(value) ? value : value === undefined || value === null ? [] : [value as JsonValue];
