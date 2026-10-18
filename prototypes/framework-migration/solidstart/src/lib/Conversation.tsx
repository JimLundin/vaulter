/** @jsxImportSource solid-js */
import { createSignal, For, Show } from 'solid-js';
import type { Session } from './session';
export default function Conversation(props: { session: Session }) {
  const [visible, setVisible] = createSignal(true);
  const session = props.session;
  return <aside class="conversation"><h2>Conversation</h2><button onClick={() => setVisible(!visible())}>{visible() ? 'Hide conversation' : 'Show conversation'}</button>
    <Show when={visible()}>
      <For each={session.chat()?.turns ?? []}>{(turn) => <article class="turn"><strong>{turn.role}</strong><For each={turn.parts}>{(part) => <Show when={part.kind === 'text'}><p>{part.kind === 'text' ? part.text : ''}</p></Show>}</For></article>}</For>
      <textarea aria-label="Conversation draft" value={session.chat()?.draft ?? ''} onInput={(event) => session.vault()?.conversation.setDraft(event.currentTarget.value)} placeholder="Draft survives navigation"/>
      <div class="row"><button onClick={() => session.vault()?.conversation.prepareSubmission()} disabled={!session.chat()?.submissionAvailability.allowed}>Send</button><Show when={session.chat()?.busy}><span role="status">Agent working…</span></Show></div>
    </Show>
    <pre class="state" aria-label="Session state">{JSON.stringify({ transactions: session.reading().transactions, modelCalls: session.vault()?.diagnostics().modelCalls ?? 0, busy: session.chat()?.busy ?? false, draft: session.chat()?.draft ?? '' }, null, 2)}</pre>
  </aside>;
}
