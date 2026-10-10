import type { LanguageModel } from 'ai';
import type { ModelMessage, SystemModelMessage, ToolSet } from 'ai';
import type { JsonObject } from '../vault/nodes/model.ts';

/** A live protocol drives the same guarded tools and lifetime as a streamed text provider. */
export interface AgentExecutionInput {
  readonly messages: readonly ModelMessage[];
  readonly instructions: readonly SystemModelMessage[];
  readonly tools: ToolSet;
  readonly signal: AbortSignal;
  readonly progress: (text: string, output?: JsonObject) => void;
}
export interface AgentExecutionResult {
  readonly status: 'complete' | 'stopped' | 'failed';
  readonly text: string;
  readonly output?: JsonObject;
  readonly model?: string;
  readonly request?: string;
}
export type AgentExecutionProvider = (input: AgentExecutionInput) => Promise<AgentExecutionResult>;

/** Provider mechanics live behind the existing AI SDK model seam. */
export type LanguageModelProvider = (model: string) => Promise<LanguageModel>;

export interface FileTranscriptionResult {
  readonly text: string;
  readonly model: string;
  readonly provider: string;
}
export type FileTranscriptionProvider = (
  audio: File,
  signal?: AbortSignal,
) => Promise<FileTranscriptionResult>;
export interface EmbeddingResult {
  readonly model: string;
  readonly dimensions: number;
  readonly vectors: readonly (readonly number[])[];
  readonly tokens: number;
}
export type EmbeddingProvider = (
  texts: readonly string[],
  signal?: AbortSignal,
) => Promise<EmbeddingResult>;
