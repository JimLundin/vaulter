<script lang="ts">
  import type { Session } from './session.svelte';
  let { session }: { session: Session } = $props();
  let visible = $state(true);
  function send() { session.vault?.conversation.prepareSubmission(); }
</script>
<aside class="conversation"><h2>Conversation</h2><button onclick={() => visible = !visible}>{visible ? 'Hide conversation' : 'Show conversation'}</button>
{#if visible}
  {#each session.chat?.turns ?? [] as turn}<article class="turn"><strong>{turn.role}</strong>{#each turn.parts as part}{#if part.kind === 'text'}<p>{part.text}</p>{/if}{/each}</article>{/each}
  <textarea aria-label="Conversation draft" value={session.chat?.draft ?? ''} oninput={(event) => session.vault?.conversation.setDraft(event.currentTarget.value)} placeholder="Draft survives navigation"></textarea>
  <div class="row"><button onclick={send} disabled={!session.chat?.submissionAvailability.allowed}>Send</button>{#if session.chat?.busy}<span role="status">Agent working…</span>{/if}</div>
{/if}
<pre class="state" aria-label="Session state">{JSON.stringify({ transactions: session.reading.transactions, modelCalls: session.vault?.diagnostics().modelCalls ?? 0, busy: session.chat?.busy ?? false, draft: session.chat?.draft ?? '' }, null, 2)}</pre></aside>
