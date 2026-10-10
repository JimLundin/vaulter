import { asSchema } from 'ai';
import { z } from 'zod';
import type { LiveVoiceProvider } from '../voice.ts';
import type { VoiceHistory, VoicePart } from '../voice.ts';
import type { JsonValue } from '../../vault/nodes/model.ts';
import { canonical } from '../../vault/nodes/json.ts';
import { serial } from '../../vault/storage/coordination.ts';
import { openAIWebRTC } from './webrtc.ts';
import type { OpenAIConnectionOptions } from './http.ts';

const functionCall = z.object({
  type: z.literal('function_call'),
  status: z.literal('completed'),
  name: z.string().min(1),
  call_id: z.string().min(1),
  arguments: z.string(),
});
const responseEvent = z.object({
  response: z.object({ id: z.string(), status: z.string(), output: z.array(z.unknown()) }),
});

/** Realtime is the speaking agent. It executes the same node tools as text, without delegation. */
export function openAILiveVoice(
  configuration: OpenAIConnectionOptions & {
    readonly model?: string;
    readonly voice?: string;
    readonly transcriptionModel?: string;
  },
): LiveVoiceProvider<VoiceHistory, VoicePart> {
  return async (options) => {
    const { instructions, events, tools, signal } = options;
    if (!instructions.trim()) throw new Error('Live voice instructions are required');
    const lifetime = new AbortController();
    const combined = AbortSignal.any([signal, lifetime.signal]);
    let transport: Awaited<ReturnType<typeof openAIWebRTC>> | undefined;
    const queue = serial();
    let work = new AbortController();
    let epoch = 0;
    let speaking = false;
    let activeResponse = false;
    let runOpen = false;
    let acceptedEpoch = -1;
    let acceptedItem = '';
    let playback = false;
    const requestedResponses = new Map<string, number>();
    let parts: VoicePart[] = [];
    const responses = new Map<string, number>();
    const calls = new Set<string>();
    const finalTranscripts = new Set<string>();
    const partials = new Map<string, string>();
    const commits: { item: string; epoch: number; started: string }[] = [];
    let speechStarted = new Date().toISOString();
    let stepCount = 0;
    const transcripts = new Map<string, string>();
    const committed = new Set<string>();
    const fail = (error: unknown) => {
      if (combined.aborted) return;
      work.abort();
      options.expire();
      lifetime.abort();
      transport?.close();
      events.error(error instanceof Error ? error : new Error('Live voice failed'));
    };
    const schedule = (operation: () => Promise<void>) => {
      queue(operation).catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        fail(error);
      });
    };
    const send = (event: Parameters<NonNullable<typeof transport>['send']>[0]) => {
      combined.throwIfAborted();
      if (!transport) throw new Error('Live voice is not ready');
      transport.send(event);
    };
    const startResponse = () => {
      if (
        combined.aborted ||
        activeResponse ||
        speaking ||
        acceptedEpoch !== epoch ||
        commits.length
      )
        return;
      activeResponse = true;
      const request = crypto.randomUUID();
      requestedResponses.set(request, epoch);
      send({ type: 'response.create', response: { metadata: { vaulter_request: request } } });
    };
    const flush = async () => {
      while (commits.length && transcripts.has(commits[0].item)) {
        const turn = commits.shift()!;
        const text = transcripts.get(turn.item)!;
        transcripts.delete(turn.item);
        if (!text.trim()) throw new Error('OpenAI returned an empty speech transcript');
        // biome-ignore lint/performance/noAwaitInLoops: preserve speech order despite out-of-order transcription completion.
        await options.acceptUser(turn.item, text, {
          started: turn.started,
          ended: new Date().toISOString(),
        });
        runOpen = true;
        acceptedEpoch = turn.epoch;
        acceptedItem = turn.item;
        parts = [];
        stepCount = 0;
      }
      startResponse();
    };
    const interrupt = () => {
      work.abort();
      work = new AbortController();
      options.expire();
      if (activeResponse && !combined.aborted) {
        send({ type: 'response.cancel' });
      }
      if (playback && !combined.aborted) send({ type: 'output_audio_buffer.clear' });
      const interruptedPlayback = playback;
      playback = false;
      activeResponse = false;
      if (runOpen || interruptedPlayback) {
        runOpen = false;
        const item = acceptedItem;
        schedule(() => options.recordResponse(item, [...parts], 'stopped'));
      }
    };
    const definitions = await Promise.all(
      Object.entries(tools).map(async ([name, tool]) => {
        if (tool.type === 'provider' || !tool.execute)
          throw new Error('Live voice requires locally executable function tools');
        return {
          type: 'function',
          name,
          description: typeof tool.description === 'string' ? tool.description : name,
          // OpenAI omits propertyNames; local validation still checks the complete schema.
          parameters: JSON.parse(
            canonical(await asSchema(tool.inputSchema).jsonSchema),
            (key, value: unknown) => (key === 'propertyNames' ? undefined : value),
          ),
        };
      }),
    );
    const completeResponse = async (event: Record<string, unknown>) => {
      const parsed = responseEvent.safeParse(event);
      if (!parsed.success) return;
      const { response } = parsed.data;
      const responseEpoch = responses.get(response.id);
      responses.delete(response.id);
      // Old, duplicate, unsolicited and interrupted completions never execute tools.
      if (
        responseEpoch !== epoch ||
        responseEpoch !== acceptedEpoch ||
        speaking ||
        combined.aborted
      )
        return;
      activeResponse = false;
      if (++stepCount > 40) throw new Error('Live voice exceeded 40 response steps for one turn');
      if (response.status !== 'completed') {
        runOpen = false;
        await options.recordResponse(
          acceptedItem,
          [...parts],
          response.status === 'cancelled' ? 'stopped' : 'failed',
        );
        return;
      }
      const completedCalls = response.output.flatMap((item) => {
        const call = functionCall.safeParse(item);
        return call.success ? [call.data] : [];
      });
      if (!completedCalls.length) {
        runOpen = false;
        await options.recordResponse(acceptedItem, [...parts], 'complete');
        return;
      }
      const execution = work;
      const callSignal = AbortSignal.any([combined, execution.signal]);
      for (const call of completedCalls) {
        if (calls.has(call.call_id)) continue;
        calls.add(call.call_id);
        callSignal.throwIfAborted();
        const tool = tools[call.name];
        if (!tool?.execute) throw new Error('OpenAI requested an unknown voice tool');
        // Transport decodes JSON; the trusted runtime validates/transforms it exactly once.
        const input: JsonValue = JSON.parse(call.arguments);
        canonical(input);
        const index = parts.length;
        parts.push({
          kind: 'tool',
          name: call.name,
          callId: call.call_id,
          input,
          status: 'running',
        });
        callSignal.throwIfAborted();
        let result: JsonValue;
        try {
          // biome-ignore lint/performance/noAwaitInLoops: acceptance of each outcome gates the next effect.
          result = await options.execute(
            { callId: call.call_id, name: call.name, input },
            callSignal,
          );
          canonical(result);
          parts[index] = {
            kind: 'tool',
            name: call.name,
            callId: call.call_id,
            input,
            status: 'complete',
            output: result,
          };
        } catch (error) {
          if (callSignal.aborted) {
            // Agent retains the accepted outcome or pending save; interruption proves no failure.
            await options.recordResponse(acceptedItem, [...parts], 'stopped');
            return;
          }
          const message = 'Tool failed; no successful result was confirmed';
          result = { error: message };
          parts[index] = {
            kind: 'tool',
            name: call.name,
            callId: call.call_id,
            input,
            status: 'failed',
            error: message,
          };
          if (error instanceof DOMException && error.name === 'AbortError') throw error;
        }
        // Preserve an accepted write/result even when speech interrupted its delivery.
        await options.recordResponse(
          acceptedItem,
          [...parts],
          callSignal.aborted ? 'stopped' : 'running',
        );
        if (callSignal.aborted) return;
        send({
          type: 'conversation.item.create',
          item: {
            type: 'function_call_output',
            call_id: call.call_id,
            output: JSON.stringify(result),
          },
        });
      }
      startResponse();
    };
    const transcript = (event: Record<string, unknown>, role: 'user' | 'agent', final: boolean) => {
      if (typeof event.item_id !== 'string') return;
      if (
        role === 'agent' &&
        (typeof event.response_id !== 'string' || responses.get(event.response_id) !== epoch)
      )
        return;
      const key = `${role}:${event.item_id}:${event.content_index ?? 0}`;
      if (finalTranscripts.has(key)) return;
      const text = final
        ? event.transcript
        : (partials.get(key) ?? '') + (typeof event.delta === 'string' ? event.delta : '');
      if (typeof text !== 'string') return;
      partials.set(key, text);
      if (final) finalTranscripts.add(key);
      events.transcript({ role, item: event.item_id, text, final });
      if (role === 'user' && final) {
        transcripts.set(event.item_id, text);
        schedule(flush);
      } else if (role === 'agent') {
        playback = true;
        // Transcript events replace one item's partial text, retaining earlier speech/tool parts.
        const previous = partials.get(`position:${key}`);
        const index = previous === undefined ? parts.length : Number(previous);
        partials.set(`position:${key}`, String(index));
        parts[index] = { kind: 'text', text };
      }
    };
    try {
      transport = await openAIWebRTC({
        ...configuration,
        signal: combined,
        session: {
          type: 'realtime',
          model: configuration.model ?? 'gpt-realtime-2.1',
          output_modalities: ['audio'],
          instructions,
          tools: definitions,
          tool_choice: 'auto',
          audio: {
            input: {
              transcription: { model: configuration.transcriptionModel ?? 'gpt-live-transcribe' },
              turn_detection: {
                type: 'semantic_vad',
                create_response: false,
                interrupt_response: false,
              },
              noise_reduction: { type: 'near_field' },
            },
            output: { voice: configuration.voice ?? 'marin' },
          },
        },
        audio: events.audio,
        error: fail,
        event: (event) => {
          if (combined.aborted) return;
          if (
            event.type === 'error' ||
            event.type === 'conversation.item.input_audio_transcription.failed'
          ) {
            fail(new Error('OpenAI live voice or transcription reported an error'));
          } else if (event.type === 'input_audio_buffer.speech_started') {
            speaking = true;
            speechStarted = new Date().toISOString();
            interrupt();
            epoch++;
          } else if (event.type === 'input_audio_buffer.speech_stopped') speaking = false;
          else if (
            event.type === 'input_audio_buffer.committed' &&
            typeof event.item_id === 'string' &&
            !committed.has(event.item_id)
          ) {
            committed.add(event.item_id);
            commits.push({ item: event.item_id, epoch, started: speechStarted });
            schedule(flush);
          } else if (event.type === 'conversation.item.input_audio_transcription.delta')
            transcript(event, 'user', false);
          else if (event.type === 'conversation.item.input_audio_transcription.completed')
            transcript(event, 'user', true);
          else if (event.type === 'output_audio_buffer.started') playback = true;
          else if (
            event.type === 'output_audio_buffer.stopped' ||
            event.type === 'output_audio_buffer.cleared'
          )
            playback = false;
          else if (event.type === 'response.created') {
            const created = z
              .object({
                response: z.object({
                  id: z.string(),
                  metadata: z.object({ vaulter_request: z.string() }),
                }),
              })
              .safeParse(event);
            if (created.success) {
              const request = created.data.response.metadata.vaulter_request;
              const requestedEpoch = requestedResponses.get(request);
              requestedResponses.delete(request);
              if (requestedEpoch !== undefined)
                responses.set(created.data.response.id, requestedEpoch);
            }
          } else if (event.type === 'response.output_audio_transcript.delta')
            transcript(event, 'agent', false);
          else if (event.type === 'response.output_audio_transcript.done')
            transcript(event, 'agent', true);
          else if (event.type === 'response.done') schedule(() => completeResponse(event));
        },
      });
      for (const message of options.history) {
        if (message.role === 'user') {
          send({
            type: 'conversation.item.create',
            item: {
              type: 'message',
              role: 'user',
              content: [{ type: 'input_text', text: message.text }],
            },
          });
          continue;
        }
        for (const part of message.parts) {
          if (part.kind === 'text')
            send({
              type: 'conversation.item.create',
              item: {
                type: 'message',
                role: 'assistant',
                content: [{ type: 'output_text', text: part.text }],
              },
            });
          else {
            send({
              type: 'conversation.item.create',
              item: {
                type: 'function_call',
                call_id: part.callId,
                name: part.name,
                arguments: JSON.stringify(part.input),
              },
            });
            send({
              type: 'conversation.item.create',
              item: {
                type: 'function_call_output',
                call_id: part.callId,
                output: JSON.stringify(
                  part.status === 'complete'
                    ? (part.output ?? null)
                    : {
                        error:
                          part.error ??
                          'No successful tool result was recorded; check node history',
                      },
                ),
              },
            });
          }
        }
      }
      return {
        mute: transport.mute,
        interrupt: () => {
          interrupt();
          epoch++;
        },
        close: () => {
          if (runOpen) {
            runOpen = false;
            const item = acceptedItem;
            schedule(() => options.recordResponse(item, [...parts], 'stopped'));
          }
          options.expire();
          work.abort();
          lifetime.abort();
          transport!.close();
          return queue(async () => {
            // Retain a transcript accepted while Close raced its persistence.
            if (runOpen) {
              runOpen = false;
              await options.recordResponse(acceptedItem, [...parts], 'stopped');
            }
          });
        },
      };
    } catch (error) {
      work.abort();
      lifetime.abort();
      transport?.close();
      throw error;
    }
  };
}
