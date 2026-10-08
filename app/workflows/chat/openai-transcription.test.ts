// @vitest-environment happy-dom
import { afterEach, expect, test, vi } from 'vitest';
import { openAITranscription, TRANSCRIPTION_MODEL } from './openai-transcription.ts';

class FakeChannel {
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
const channel = new FakeChannel();
class FakePeer {
  connectionState = 'connected';
  onconnectionstatechange: (() => void) | null = null;
  createDataChannel = () => channel;
  addTrack = vi.fn();
  createOffer = async () => ({ type: 'offer', sdp: 'offer SDP' });
  setLocalDescription = vi.fn(async () => undefined);
  setRemoteDescription = vi.fn(async () => undefined);
  close = vi.fn();
}
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  channel.sent = [];
});

function harness() {
  const track = { enabled: true, stop: vi.fn() };
  const microphone = { getTracks: () => [track], getAudioTracks: () => [track] };
  const getUserMedia = vi.fn(async () => microphone);
  const peer = new FakePeer();
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(Response.json({ value: 'short-lived-fixture' }))
    .mockResolvedValueOnce(new Response('answer SDP'));
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } });
  vi.stubGlobal(
    'RTCPeerConnection',
    class {
      constructor() {
        // biome-ignore lint/correctness/noConstructorReturn: stand-in for the browser's native peer constructor
        return peer;
      }
    },
  );
  vi.stubGlobal('fetch', fetch);
  return { track, getUserMedia, peer, fetch };
}

test('opens scoped transcription WebRTC, emits deltas, commits on finish and waits for the final', async () => {
  vi.useFakeTimers();
  const { fetch, track, peer } = harness();
  const text = vi.fn();
  const error = vi.fn();
  const abort = new AbortController();
  const session = await openAITranscription('unlocked-fixture-key')({ text, error }, abort.signal);
  const [tokenCall] = fetch.mock.calls;
  expect(tokenCall[0]).toBe('https://api.openai.com/v1/realtime/client_secrets');
  const body = JSON.parse(tokenCall[1].body);
  expect(body.session.type).toBe('transcription');
  expect(body.session.audio.input.transcription).toEqual({
    model: TRANSCRIPTION_MODEL,
    delay: 'low',
  });
  expect(body.session.audio.input.turn_detection).toBeNull();
  expect(body.session.audio.input.format).toBeUndefined();
  expect(body.session.tools).toBeUndefined();
  expect(fetch.mock.calls[1][1].headers.Authorization).toBe('Bearer short-lived-fixture');
  expect(track.enabled).toBe(true);
  channel.event({
    type: 'conversation.item.input_audio_transcription.delta',
    item_id: 'one',
    delta: 'Walk',
  });
  expect(text).toHaveBeenLastCalledWith('Walk');
  const finishing = session.finish();
  expect(track.enabled).toBe(false);
  await vi.advanceTimersByTimeAsync(200);
  expect(channel.sent).toEqual([{ type: 'input_audio_buffer.commit' }]);
  channel.event({ type: 'input_audio_buffer.committed', item_id: 'one' });
  channel.event({
    type: 'conversation.item.input_audio_transcription.completed',
    item_id: 'one',
    transcript: 'Walk before work.',
  });
  expect(await finishing).toBe('Walk before work.');
  expect(text).toHaveBeenLastCalledWith('Walk before work.');
  session.close();
  expect(track.stop).toHaveBeenCalledOnce();
  expect(peer.close).toHaveBeenCalledOnce();
  expect(error).not.toHaveBeenCalled();
});

test('stops tracks obtained after a cancelled permission request and never opens an API session', async () => {
  const { fetch, track } = harness();
  let allow!: () => void;
  const microphone = { getTracks: () => [track], getAudioTracks: () => [track] };
  vi.stubGlobal('navigator', {
    mediaDevices: {
      getUserMedia: () =>
        new Promise((resolve) => {
          allow = () => resolve(microphone);
        }),
    },
  });
  const abort = new AbortController();
  const opening = openAITranscription('fixture')({ text: vi.fn(), error: vi.fn() }, abort.signal);
  abort.abort();
  allow();
  await expect(opening).rejects.toThrow();
  expect(track.stop).toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();
});

test('rejects API failures without leaking response bodies and closes microphone tracks', async () => {
  const { fetch, track, peer } = harness();
  fetch.mockReset().mockResolvedValue(new Response('sensitive upstream body', { status: 401 }));
  await expect(
    openAITranscription('fixture')({ text: vi.fn(), error: vi.fn() }, new AbortController().signal),
  ).rejects.toThrow('401');
  expect(track.stop).toHaveBeenCalledOnce();
  expect(peer.close).toHaveBeenCalledOnce();
});
