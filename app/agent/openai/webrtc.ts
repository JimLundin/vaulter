// Shared browser media transport for OpenAI realtime voice and transcription.
import type { JsonObject } from '../../vault/nodes/model.ts';
import { openAIHttp, clientSecretSchema, type OpenAIConnectionOptions } from './http.ts';

export async function openAIWebRTC(
  options: OpenAIConnectionOptions & {
    readonly session: JsonObject;
    readonly signal: AbortSignal;
    readonly event: (event: Record<string, unknown>) => void;
    readonly error: (error: Error) => void;
    readonly audio?: (stream: MediaStream) => void;
    readonly messages?: {
      readonly unavailable: string;
      readonly credential: string;
      readonly channelClosed: string;
      readonly mediaLost: string;
      readonly timeout: string;
    };
  },
) {
  if (
    typeof navigator === 'undefined' ||
    !navigator.mediaDevices?.getUserMedia ||
    typeof RTCPeerConnection === 'undefined'
  )
    throw new Error(options.messages?.unavailable ?? 'Live audio is unavailable in this browser');
  options.signal.throwIfAborted();
  const http = openAIHttp(options);
  const peer = new RTCPeerConnection();
  const channel = peer.createDataChannel('oai-events');
  let microphone: MediaStream | undefined;
  let closed = false;
  let rejectOpen: ((error: Error) => void) | undefined;
  let readyTimer: ReturnType<typeof setTimeout> | undefined;
  const close = () => {
    if (closed) return;
    closed = true;
    clearTimeout(readyTimer);
    options.signal.removeEventListener('abort', aborted);
    for (const track of microphone?.getTracks() ?? []) track.stop();
    rejectOpen?.(new DOMException('Live audio closed', 'AbortError'));
    channel.onmessage = null;
    channel.onopen = null;
    channel.onclose = null;
    peer.onconnectionstatechange = null;
    peer.ontrack = null;
    channel.close();
    peer.close();
  };
  const aborted = () => close();
  const failed = (error: Error) => {
    if (closed) return;
    close();
    options.error(error);
  };
  options.signal.addEventListener('abort', aborted, { once: true });
  channel.onmessage = ({ data }) => {
    if (closed) return;
    let event: unknown;
    try {
      event = JSON.parse(data);
    } catch {
      return;
    }
    if (!event || typeof event !== 'object' || Array.isArray(event)) return;
    options.event(event as Record<string, unknown>);
  };
  channel.onclose = () =>
    failed(new Error(options.messages?.channelClosed ?? 'The OpenAI live audio connection closed'));
  peer.onconnectionstatechange = () => {
    if (['failed', 'disconnected', 'closed'].includes(peer.connectionState))
      failed(new Error(options.messages?.mediaLost ?? 'The OpenAI media connection was lost'));
  };
  peer.ontrack = ({ streams }) => {
    if (!closed && streams[0]) options.audio?.(streams[0]);
  };
  try {
    microphone = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
    if (closed || options.signal.aborted) {
      for (const track of microphone.getTracks()) track.stop();
      throw new DOMException('Live audio cancelled', 'AbortError');
    }
    for (const track of microphone.getAudioTracks()) {
      track.enabled = false;
      peer.addTrack(track, microphone);
    }
    const tokenResponse = await http.post(
      'realtime/client_secrets',
      JSON.stringify({
        expires_after: { anchor: 'created_at', seconds: 60 },
        session: options.session,
      }),
      options.signal,
      'application/json',
    );
    const parsedToken = clientSecretSchema.safeParse(await tokenResponse.json());
    if (!parsedToken.success)
      throw new Error(
        options.messages?.credential ?? 'OpenAI did not return a live audio session credential.',
      );
    const token = parsedToken.data;
    if (closed) throw new DOMException('Live audio closed', 'AbortError');
    const offer = await peer.createOffer();
    await peer.setLocalDescription(offer);
    const answer = await http.post(
      'realtime/calls',
      offer.sdp!,
      options.signal,
      'application/sdp',
      token.value,
    );
    if (closed) throw new DOMException('Live audio closed', 'AbortError');
    await peer.setRemoteDescription({ type: 'answer', sdp: await answer.text() });
    options.signal.throwIfAborted();
    if (channel.readyState !== 'open')
      await new Promise<void>((resolve, reject) => {
        rejectOpen = reject;
        channel.onopen = () => {
          clearTimeout(readyTimer);
          rejectOpen = undefined;
          resolve();
        };
        readyTimer = setTimeout(
          () =>
            reject(
              new Error(options.messages?.timeout ?? 'OpenAI live audio connection timed out'),
            ),
          15_000,
        );
      });
    options.signal.throwIfAborted();
    if (closed) throw new Error('Live audio closed while connecting');
    const mute = (muted: boolean) => {
      if (!closed) for (const track of microphone!.getAudioTracks()) track.enabled = !muted;
    };
    mute(false);
    return {
      close,
      mute,
      send: (event: JsonObject) => {
        if (closed || options.signal.aborted || channel.readyState !== 'open')
          throw new Error('Live audio connection is closed');
        channel.send(JSON.stringify(event));
      },
    };
  } catch (error) {
    close();
    throw error;
  }
}
