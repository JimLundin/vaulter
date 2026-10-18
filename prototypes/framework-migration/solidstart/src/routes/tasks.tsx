/** @jsxImportSource solid-js */
import { createSignal, For } from 'solid-js';
import { Title } from '@solidjs/meta';
import { useVault } from '../lib/session';
import { taskStatuses, taskStatusLabels, type TaskStatus } from '@/modules/tasks/operations.ts';
export default function Tasks() {
  const session = useVault(); const [title, setTitle] = createSignal('');
  async function create() { const vault = session.vault(); if (!vault || !title().trim()) return; await vault.createTask(title()); setTitle(''); }
  return <><Title>Tasks · SolidStart prototype</Title><h2>Tasks</h2><p>Changes append real Transactions and update this subscribed projection.</p>
    <form class="row" onSubmit={(event) => { event.preventDefault(); void create(); }}><input aria-label="New Task title" value={title()} onInput={(event) => setTitle(event.currentTarget.value)} placeholder="New task title"/><button disabled={!session.vault()}>Create task</button></form>
    <ul><For each={session.reading().tasks}>{(task) => <li><div class="row"><strong>{task.title}</strong><select aria-label={`Status for ${task.title}`} value={task.status} onChange={(event) => void session.vault()?.reviseTask(task, event.currentTarget.value as TaskStatus)}><For each={taskStatuses}>{(status) => <option value={status}>{taskStatusLabels[status]}</option>}</For></select></div></li>}</For></ul></>;
}
