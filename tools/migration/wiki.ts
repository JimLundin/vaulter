// Migration explicitly composes record owners; generic Vault records never depend on Wiki.
import { agentSources } from '../../app/agent/sources.ts';
import { parseAgentRun, parseContextInput, parseToolExecution } from '../../app/agent/schema.ts';
import { contentSources } from '../../app/vault/content/sources.ts';
import { parseVaultRecord } from '../../app/vault/records/index.ts';
import { retainedRecordSources } from '../../app/vault/records/sources.ts';
import { describeSource, type SourceReader } from '../../app/vault/sources.ts';
import type { NodeSnapshot } from '../../app/vault/nodes/store.ts';
import type { NodeRecord } from '../../app/vault/nodes/validation.ts';
import type { JsonObject } from '../../app/vault/nodes/model.ts';
import {
  parseMetadata,
  parseMetadataReference,
} from '../../app/workflows/chat/records/chat-metadata-schema.ts';
import {
  parseChatReference,
  parseConversation,
  parseExchange,
  parseMessage,
} from '../../app/workflows/chat/records/chat-schema.ts';
import { chatSources } from '../../app/workflows/chat/records/sources.ts';
import { parseWikiRecord, wikiSchemas } from '../../app/workflows/wiki/records.ts';

const owners = [
  chatSources((node) => `#/chat/${encodeURIComponent(node)}/`),
  contentSources,
  retainedRecordSources,
  agentSources,
];
export const migrationSources: SourceReader = {
  text: (node, context) => {
    for (const owner of owners) {
      const text = owner.text(node, context);
      if (text !== undefined) return text;
    }
  },
  describe: (node, view) => describeSource(node, view, owners),
};

const ownedParsers: Record<string, (value: unknown) => JsonObject> = {
  conversation: parseConversation,
  exchange: parseExchange,
  message: parseMessage,
  reference: parseChatReference,
  observation: parseMetadata,
  attachment: parseMetadata,
  interpretation: parseMetadata,
  metadataReference: parseMetadataReference,
  contextInput: parseContextInput,
  agentRun: parseAgentRun,
  toolExecution: parseToolExecution,
};
/** Validate with the owning module while retaining the original accepted payload. */
export function parseMigrationRecord(value: unknown) {
  const kind = (value as { kind?: unknown } | null)?.kind;
  if (typeof kind === 'string' && Object.hasOwn(wikiSchemas, kind)) return parseWikiRecord(value);
  if (typeof kind === 'string' && Object.hasOwn(ownedParsers, kind))
    return ownedParsers[kind]!(value);
  return parseVaultRecord(value);
}

/** Containment cannot enumerate selected Citations whose parent has been deleted. */
export function selectedCitations(records: readonly NodeRecord[], view: NodeSnapshot) {
  return records.flatMap((record) =>
    record.versions.filter(
      (node) =>
        node.data?.kind === 'cite' &&
        view.get(node.key.node)?.key.transaction === node.key.transaction,
    ),
  );
}
