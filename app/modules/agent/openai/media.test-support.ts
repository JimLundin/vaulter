import { vi } from 'vitest';

export class Channel {
  readyState = 'open';
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onopen: (() => void) | null = null;
  sent: Record<string, unknown>[] = [];
  close = vi.fn();
  send(data: string) {
    this.sent.push(JSON.parse(data));
  }
  event(event: Record<string, unknown>) {
    this.onmessage?.({ data: JSON.stringify(event) });
  }
}
export function media() {
  const channel = new Channel();
  const track = { enabled: true, stop: vi.fn() };
  const microphone = { getTracks: () => [track], getAudioTracks: () => [track] };
  const peer = {
    connectionState: 'connected',
    onconnectionstatechange: null,
    ontrack: null,
    createDataChannel: () => channel,
    addTrack: vi.fn(),
    createOffer: () => Promise.resolve({ type: 'offer', sdp: 'offer SDP' }),
    setLocalDescription: vi.fn(() => Promise.resolve()),
    setRemoteDescription: vi.fn(() => Promise.resolve()),
    close: vi.fn(),
  };
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: () => Promise.resolve(microphone) } });
  vi.stubGlobal(
    'RTCPeerConnection',
    class {
      constructor() {
        // biome-ignore lint/correctness/noConstructorReturn: fake native browser media constructor.
        return peer;
      }
    },
  );
  const fetch = vi
    .fn<typeof globalThis.fetch>()
    .mockResolvedValueOnce(Response.json({ value: 'ephemeral-fixture' }))
    .mockResolvedValueOnce(new Response('answer SDP'));
  return { channel, track, peer, microphone, fetch };
}
export function speech(channel: Channel, item = 'user-1', text = 'Capture a paragraph') {
  channel.event({ type: 'input_audio_buffer.speech_started', item_id: item });
  channel.event({ type: 'input_audio_buffer.speech_stopped', item_id: item });
  channel.event({ type: 'input_audio_buffer.committed', item_id: item });
  channel.event({
    type: 'conversation.item.input_audio_transcription.completed',
    item_id: item,
    transcript: text,
  });
}
export function response(channel: Channel, id = 'response-1') {
  const requested = channel.sent
    .filter((event) => event.type === 'response.create')
    .at(-1)?.response;
  channel.event({ type: 'response.created', response: { id, ...(requested as object) } });
}
export function call(name: string, input: unknown, id = 'call-1') {
  return {
    type: 'function_call',
    status: 'completed',
    name,
    call_id: id,
    arguments: JSON.stringify(input),
  };
}
export function done(
  channel: Channel,
  output: unknown[] = [],
  status = 'completed',
  id = 'response-1',
) {
  channel.event({ type: 'response.done', response: { id, status, output } });
}
export const creates = (channel: Channel) =>
  channel.sent.filter((event) => event.type === 'response.create').length;
export const outputs = (channel: Channel) =>
  channel.sent.filter((event) => event.type === 'conversation.item.create');
