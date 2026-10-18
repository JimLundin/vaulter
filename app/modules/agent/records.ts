import { type EntityRef, e } from '@/core/store/index.ts';
import { Actor, ActorBinding } from '@/modules/actors/index.ts';

export const ToolDefinition = e.entity('agent.toolDefinition', {
  name: e.string(),
  version: e.string(),
});

/** Editable configuration. Each run copies the configuration it actually uses. */
export const Agent = e.entity('agent', {
  actor: e.ref(Actor),
  provider: e.string(),
  model: e.string(),
  instructions: e.string(),
  settings: e.json(),
  tools: e.set(e.ref(ToolDefinition)),
});

export const AgentRun = e.entity('agent.run', {
  agent: e.ref(Agent).optional(),
  agentActor: e.ref(Actor).optional(),
  provenance: e.retainedStateRef().optional(),
  author: e.ref(Actor),
  startedAt: e.datetime(),
  status: e.enum('running', 'complete', 'failed', 'stopped', 'interrupted'),
  provider: e.string(),
  requestedModel: e.string(),
  instructions: e.string(),
  settings: e.json(),
  endedAt: e.datetime().optional(),
  servedModel: e.string().optional(),
  request: e.string().optional(),
  finishReason: e.string().optional(),
  elapsedMs: e.number().optional(),
  firstOutputMs: e.number().optional(),
  inputTokens: e.number().optional(),
  outputTokens: e.number().optional(),
  cachedInputTokens: e.number().optional(),
  reasoningTokens: e.number().optional(),
  usage: e.json().optional(),
  cost: e.json().optional(),
  output: e.json().optional(),
  error: e.json().optional(),
});

/** One observable provider request. External transports may not expose this boundary. */
export const ModelStep = e.entity('agent.modelStep', {
  run: e.ref(AgentRun),
  position: e.number(),
  startedAt: e.datetime(),
  status: e.enum('running', 'complete', 'failed', 'stopped'),
  inputFormat: e.enum('ai-sdk-model-messages-v7'),
  input: e.json(),
  configuration: e.json(),
  endedAt: e.datetime().optional(),
  response: e.json().optional(),
  error: e.json().optional(),
});

/** Accepted tool identity. Historical activity can explicitly retain an unknown version. */
export const RunTool = e.entity('agent.runTool', {
  run: e.ref(AgentRun),
  name: e.string(),
  version: e.string().optional(),
  versionStatus: e.enum('unknown').optional(),
});

export const ContextInput = e.entity('agent.contextInput', {
  run: e.ref(AgentRun),
  position: e.number(),
  role: e.enum('system', 'user', 'assistant', 'tool'),
  transformation: e.enum('verbatim', 'selection', 'summary', 'truncation', 'generated'),
  content: e.json(),
});

export const ToolExecution = e.entity('agent.toolExecution', {
  tool: e.ref(RunTool),
  step: e.ref(ModelStep).optional(),
  position: e.number(),
  call: e.string(),
  attempt: e.number(),
  startedAt: e.datetime(),
  status: e.enum('running', 'complete', 'failed', 'cancelled'),
  input: e.json(),
  endedAt: e.datetime().optional(),
  elapsedMs: e.number().optional(),
  output: e.json().optional(),
  error: e.json().optional(),
});

export const agentEntities = {
  actors: Actor,
  actorBindings: ActorBinding,
  agents: Agent,
  toolDefinitions: ToolDefinition,
  agentRuns: AgentRun.extend({
    inputs: e.inverse(ContextInput, 'run'),
    tools: e.inverse(RunTool, 'run'),
  }),
  runTools: RunTool.extend({ executions: e.inverse(ToolExecution, 'tool') }),
  contextInputs: ContextInput,
  modelSteps: ModelStep,
  toolExecutions: ToolExecution,
} as const;

export const agentSchema = e.registry(agentEntities);
export type AgentRef = EntityRef<typeof Agent>;
export type AgentRunRef = EntityRef<typeof AgentRun>;
export type RunToolRef = EntityRef<typeof RunTool>;
export type ToolExecutionRef = EntityRef<typeof ToolExecution>;

export type ModelStepRef = EntityRef<typeof ModelStep>;
