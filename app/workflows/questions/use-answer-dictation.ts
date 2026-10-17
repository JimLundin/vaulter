import { useLayoutEffect, useRef } from 'react';
import { useTranscript, type Transcription, type TranscriptionState } from '@/transcription.ts';
import type { Question } from './reading.ts';

const active = (phase: TranscriptionState['phase']) =>
  phase === 'connecting' || phase === 'listening' || phase === 'finishing';

interface AnswerRecording {
  readonly voice: Transcription;
  readonly question: string;
  readonly version: string;
  readonly choice: string;
  readonly prefix: string;
  session: string | null;
  revision: number;
}

/** A borrowed recording can update only the question and choice that admitted it. */
export function useAnswerDictation(options: {
  transcription?: Transcription;
  question: Question;
  choice: string;
  text: string;
  onText: (text: string) => void;
  disabled: boolean;
}) {
  const { transcription, question, choice, disabled } = options;
  const current = useRef(options);
  current.current = options;
  const association = useRef<AnswerRecording | undefined>(undefined);
  const state = useTranscript(transcription);
  const cancel = () => {
    const recording = association.current;
    association.current = undefined;
    if (recording?.session) recording.voice.clear(recording.session);
  };
  const owns = () => {
    const recording = association.current;
    return (
      !!recording &&
      recording.voice === transcription &&
      recording.session === transcription?.snapshot().session
    );
  };
  const recording = () => owns() && active(transcription!.snapshot().phase);

  useLayoutEffect(() => {
    const reflect = () => {
      const next = transcription?.snapshot();
      const captured = association.current;
      if (!(next && captured) || captured.voice !== transcription) return;
      if (next.phase === 'connecting' && !captured.session) captured.session = next.session;
      const latest = current.current;
      if (
        next.session !== captured.session ||
        latest.disabled ||
        latest.question.id !== captured.question ||
        latest.question.evidence.transaction !== captured.version ||
        latest.choice !== captured.choice
      )
        return;
      if (next.revision !== captured.revision) {
        captured.revision = next.revision;
        const separator = captured.prefix && next.text && !/\s$/.test(captured.prefix) ? ' ' : '';
        latest.onText(`${captured.prefix}${separator}${next.text}`);
      }
    };
    const unsubscribe = transcription?.subscribe(reflect);
    return () => {
      unsubscribe?.();
      const captured = association.current;
      if (captured && captured.voice === transcription) {
        association.current = undefined;
        if (captured.session) captured.voice.clear(captured.session);
      }
    };
  }, [transcription]);

  useLayoutEffect(() => {
    const captured = association.current;
    if (
      captured &&
      (disabled ||
        captured.question !== question.id ||
        captured.version !== question.evidence.transaction ||
        captured.choice !== choice)
    ) {
      association.current = undefined;
      if (captured.session) captured.voice.clear(captured.session);
    }
  }, [disabled, question.id, question.evidence.transaction, choice]);

  return {
    phase: owns() ? state.phase : ('idle' as const),
    error: owns() ? state.error : '',
    active: recording(),
    recording,
    allowed:
      !!transcription &&
      (active(state.phase)
        ? owns() && state.phase !== 'finishing'
        : !(disabled || transcription.availability())),
    cancel,
    async action() {
      if (!transcription) return;
      const next = transcription.snapshot();
      if (active(next.phase)) {
        if (!owns()) return;
        if (next.phase === 'connecting') cancel();
        else if (next.phase === 'listening') await transcription.finish(next.session ?? undefined);
        return;
      }
      if (current.current.disabled || transcription.availability()) return;
      const latest = current.current;
      association.current = {
        voice: transcription,
        question: latest.question.id,
        version: latest.question.evidence.transaction,
        choice: latest.choice,
        prefix: latest.text,
        session: null,
        revision: 0,
      };
      await transcription.start();
    },
  };
}
