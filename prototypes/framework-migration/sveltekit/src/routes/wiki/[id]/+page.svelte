<script lang="ts">
  import { getContext } from 'svelte';
  import { page } from '$app/state';
  import type { Session } from '../../../lib/session.svelte';
  const session = getContext<Session>('vault');
  const record = $derived(session.reading.pages.find((item) => item.id === page.params.id));
</script>
<svelte:head><title>{record?.title ?? 'Wiki'} · SvelteKit prototype</title></svelte:head>
{#if record}<h2>{record.title}</h2><p>{record.summary}</p>{#each record.blocks as block}<p>{String(block.data.text ?? '')}</p>{/each}<pre class="state">Record: {record.id}</pre>{:else}<h2>Record unavailable</h2><p>A memory-only reload resets the Vault; runtime routing still resolves this URL.</p>{/if}<a href="/wiki/">Back to Wiki</a>
