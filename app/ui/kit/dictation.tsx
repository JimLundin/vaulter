// Browser dictation stays behind one kit control; workflows receive the resulting text.
import { type RefObject, useEffect, useRef, useState } from 'react';
import { Button } from './parts/button.tsx';
import { Icon } from './icons.tsx';
interface Recognition {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  onresult:
    | ((event: {
        resultIndex: number;
        results: ArrayLike<{ isFinal: boolean; [index: number]: { transcript: string } }>;
      }) => void)
    | null;
}
type SpeechWindow = typeof globalThis & {
  SpeechRecognition?: new () => Recognition;
  webkitSpeechRecognition?: new () => Recognition;
};
export function DictateButton({
  textareaRef,
  onText,
  disabled,
}: {
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  onText: (text: string) => void;
  disabled?: boolean;
}) {
  const [listening, setListening] = useState(false);
  const recognition = useRef<Recognition | null>(null);
  const Constructor =
    (globalThis as SpeechWindow).SpeechRecognition ??
    (globalThis as SpeechWindow).webkitSpeechRecognition;
  useEffect(() => {
    if (!Constructor) return;
    const speech = new Constructor();
    speech.continuous = true;
    speech.interimResults = false;
    speech.lang = navigator.language;
    speech.onstart = () => setListening(true);
    speech.onend = () => setListening(false);
    speech.onerror = () => setListening(false);
    speech.onresult = (event) => {
      let transcript = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i]?.isFinal) transcript += event.results[i][0]?.transcript ?? '';
      }
      if (transcript) {
        const value = textareaRef.current?.value ?? '';
        onText(value + (value ? ' ' : '') + transcript);
      }
    };
    recognition.current = speech;
    return () => {
      speech.onstart = null;
      speech.onend = null;
      speech.onerror = null;
      speech.onresult = null;
      speech.stop();
      recognition.current = null;
    };
  }, [Constructor, onText, textareaRef]);
  useEffect(() => {
    if (disabled) recognition.current?.stop();
  }, [disabled]);
  return (
    <Button
      type="button"
      variant={listening ? 'secondary' : 'ghost'}
      size="icon-lg"
      disabled={disabled || !Constructor}
      title={!Constructor ? 'Dictation is unavailable in this browser' : undefined}
      aria-label={listening ? 'Stop dictation' : 'Dictate'}
      aria-pressed={listening}
      onClick={() => {
        if (listening) recognition.current?.stop();
        else recognition.current?.start();
      }}
    >
      <Icon name="mic" />
    </Button>
  );
}
