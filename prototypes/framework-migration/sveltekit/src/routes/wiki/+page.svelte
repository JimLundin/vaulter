<script lang="ts">
  import { getContext } from 'svelte';
  import { goto } from '$app/navigation';
  import type { Session } from '../../lib/session.svelte';
  const session = getContext<Session>('vault');
  let title = $state('');
  async function create() { if (!session.vault || !title.trim()) return; const id = await session.vault.createPage(title); title = ''; await goto(`/wiki/${encodeURIComponent(id)}/`); }
</script>
<svelte:head><title>Wiki · SvelteKit prototype</title></svelte:head>
<h2>Wiki</h2><p>Runtime Record identities, projected through the existing Wiki module.</p>
<form class="row" onsubmit={(event) => { event.preventDefault(); void create(); }}><input aria-label="New Wiki title" bind:value={title} placeholder="New page title"/><button disabled={!session.vault}>Create page</button></form>
<ul>{#each session.reading.pages as page}<li><a href={`/wiki/${encodeURIComponent(page.id)}/`}>{page.title}</a><p>{page.summary}</p></li>{/each}</ul>
