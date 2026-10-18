<script lang="ts">
  import { getContext } from 'svelte';
  import type { Session } from '../../lib/session.svelte';
  import { taskStatuses, taskStatusLabels, type TaskStatus } from '@/modules/tasks/operations.ts';
  const session = getContext<Session>('vault');
  let title = $state('');
  async function create() { if (!session.vault || !title.trim()) return; await session.vault.createTask(title); title = ''; }
</script>
<svelte:head><title>Tasks · SvelteKit prototype</title></svelte:head>
<h2>Tasks</h2><p>Changes append real Transactions and update this subscribed projection.</p>
<form class="row" onsubmit={(event) => { event.preventDefault(); void create(); }}><input aria-label="New Task title" bind:value={title} placeholder="New task title"/><button disabled={!session.vault}>Create task</button></form>
<ul>{#each session.reading.tasks as task}<li><div class="row"><strong>{task.title}</strong><select aria-label={`Status for ${task.title}`} value={task.status} onchange={(event) => void session.vault?.reviseTask(task, event.currentTarget.value as TaskStatus)}>{#each taskStatuses as status}<option value={status}>{taskStatusLabels[status]}</option>{/each}</select></div></li>{/each}</ul>
