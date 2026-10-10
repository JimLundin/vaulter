// Agent owns execution payloads. Existing JSON meanings remain compatible.
import type { JsonObject, JsonValue } from '../vault/nodes/model.ts';
// biome-ignore lint/style/useConsistentTypeDefinitions: type aliases satisfy JsonObject structurally
export type TextSelection = {
  readonly format: 'text';
  readonly start: number;
  readonly end: number;
  readonly unit: 'utf16';
};
// biome-ignore lint/style/useConsistentTypeDefinitions: type aliases satisfy JsonObject structurally
export type ContextInputData = {
  readonly kind: 'contextInput';
  readonly role: 'system' | 'user' | 'assistant' | 'tool';
  readonly position: number;
  readonly transformation: 'verbatim' | 'selection' | 'summary' | 'truncation' | 'generated';
  /** Effective content supplied to the provider, including generated instructions/projections. */
  readonly content: string | JsonObject;
  readonly selection?: TextSelection;
};
// biome-ignore lint/style/useConsistentTypeDefinitions: type aliases satisfy JsonObject structurally
export type AgentRunData = {
  readonly kind: 'agentRun';
  readonly started: string;
  readonly ended?: string;
  readonly status: 'running' | 'complete' | 'stopped' | 'failed' | 'interrupted';
  readonly provider: string;
  readonly model: { readonly requested: string; readonly served?: string };
  readonly settings: JsonObject;
  readonly enabledTools: readonly { readonly name: string; readonly version?: string }[];
  readonly request?: string;
  readonly finishReason?: string;
  readonly timing?: { readonly elapsedMs: number; readonly firstOutputMs?: number };
  readonly usage?: {
    readonly input: number;
    readonly output: number;
    readonly cachedInput?: number;
    readonly reasoning?: number;
    readonly raw?: JsonObject;
  };
  readonly cost?: {
    readonly amount: number;
    readonly currency: string;
    readonly estimated: boolean;
    readonly pricing: {
      readonly source: string;
      readonly at: string;
      readonly rates: JsonObject;
    };
  };
  readonly error?: { readonly code: string; readonly message: string };
  /** Independent execution output; Chat may project this into a message. */
  readonly output?: JsonObject;
};
// biome-ignore lint/style/useConsistentTypeDefinitions: type aliases satisfy JsonObject structurally
export type ToolExecutionData = {
  readonly kind: 'toolExecution';
  readonly call: string;
  readonly name: string;
  readonly version?: string;
  readonly attempt: number;
  readonly started: string;
  readonly ended?: string;
  readonly elapsedMs?: number;
  readonly status: 'running' | 'complete' | 'failed' | 'cancelled';
  readonly input: JsonValue;
  readonly output?: JsonValue;
  readonly error?: { readonly code: string; readonly message: string };
};
