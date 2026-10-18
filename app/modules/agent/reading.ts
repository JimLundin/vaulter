import { modelMessageSchema } from 'ai';
import type { AgentRunRef, agentSchema } from './records.ts';
import { readAgentRun } from './operations.ts';
import type { ReadView } from '@/core/store/index.ts';
import type { HistoryPart } from './history.ts';
import type { AgentRunState } from './runtime.ts';

const jsonError = (value: unknown) =>
  value && typeof value === 'object' && 'message' in value ? String(value.message) : undefined;

/** Recorded activity is read without resuming execution; only the current model format is decoded. */
export async function readAgentActivity(view: ReadView<typeof agentSchema>, identity: AgentRunRef) {
  const run = await readAgentRun(view, identity);
  if (!run) return;
  const receipts = run.executions.map((execution) => ({
    kind: 'tool' as const,
    callId: execution.call,
    name: execution.tool.name,
    // Preserve the earlier unversioned display while retaining explicit unknown historical versions.
    version: execution.tool.version === 'unversioned' ? undefined : execution.tool.version,
    ...(execution.tool.versionStatus && { versionStatus: execution.tool.versionStatus }),
    input: execution.input,
    status: execution.status,
    ...(execution.output !== undefined && { output: execution.output }),
    ...(execution.error !== undefined && { error: jsonError(execution.error) }),
  }));
  const parts: HistoryPart[] = [];
  for (const step of run.steps) {
    if (step.inputFormat !== 'ai-sdk-model-messages-v7')
      throw new Error('Unsupported Agent model input format');
    const { response } = step;
    if (response === undefined) continue;
    if (
      !(
        response &&
        typeof response === 'object' &&
        'messages' in response &&
        Array.isArray(response.messages)
      )
    )
      throw new Error('Invalid Agent model response');
    for (const raw of response.messages) {
      const message = modelMessageSchema.parse(raw);
      if (message.role !== 'assistant') continue;
      if (typeof message.content === 'string') parts.push({ kind: 'text', text: message.content });
      else
        for (const block of message.content) {
          if (block.type === 'text') parts.push({ kind: 'text', text: block.text });
          if (block.type === 'tool-call') {
            const receipt = receipts.find((item) => item.callId === block.toolCallId);
            if (
              receipt &&
              !parts.some((item) => item.kind === 'tool' && item.callId === receipt.callId)
            )
              parts.push(receipt);
          }
        }
    }
  }
  // Partial or opaque external execution can expose receipts without an observable model response.
  for (const receipt of receipts)
    if (!parts.some((part) => part.kind === 'tool' && part.callId === receipt.callId))
      parts.push(receipt);
  if (
    run.output &&
    typeof run.output === 'object' &&
    'text' in run.output &&
    typeof run.output.text === 'string'
  ) {
    const recordedText = parts
      .flatMap((part) => (part.kind === 'text' ? [part.text] : []))
      .join('');
    const remaining = run.output.text.startsWith(recordedText)
      ? run.output.text.slice(recordedText.length)
      : '';
    if (remaining) parts.push({ kind: 'text', text: remaining });
  }
  return {
    at: run.startedAt.toISOString(),
    status: run.status,
    parts,
    model: run.servedModel ?? run.requestedModel,
    ...(run.inputTokens !== undefined &&
      run.outputTokens !== undefined && {
        tokens: { in: run.inputTokens, out: run.outputTokens },
      }),
    ...(run.error !== undefined && { error: jsonError(run.error) }),
  };
}

/** Live progress uses the same owner interpretation as recorded activity. */
export function agentActivity(state: AgentRunState) {
  const receipts = [...(state.tools ?? [])];
  if (state.pendingTool?.stage === 'outcome') {
    const pending = state.pendingTool;
    const index = receipts.findIndex((tool) => tool.node === pending.node);
    const receipt = { node: pending.node, data: pending.execution };
    if (index >= 0) receipts[index] = receipt;
    else receipts.push(receipt);
  }
  const parts: HistoryPart[] = receipts.map(({ data }) => ({
    kind: 'tool',
    callId: data.call,
    name: data.name,
    version: data.version === 'unversioned' ? undefined : data.version,
    input: data.input,
    status: data.status,
    ...(data.output !== undefined && { output: data.output }),
    ...(data.error && { error: data.error.message }),
  }));
  if (state.text) parts.push({ kind: 'text', text: state.text });
  return parts;
}
