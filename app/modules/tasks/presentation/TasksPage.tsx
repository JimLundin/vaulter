import { useId, useRef, useState } from 'react';
import { sameEntity, SaveError } from '@/core/store/index.ts';
import { later } from '@/shared/async/later.ts';
import {
  Button,
  FeaturePage,
  Stack,
  Row,
  Text,
  Heading,
  Surface,
  Columns,
  SettingField,
  Field,
  FieldLabel,
  Input,
  TextBox,
  Select,
  Overlay,
  Loader,
} from '@/shared/ui/kit/index.ts';
import {
  taskStatuses,
  boardStatuses,
  taskStatusLabels,
  type TaskData,
  type TaskRecord,
  type TaskRef,
  type TaskInput,
} from '@/modules/tasks/index.ts';
import { TaskCard } from './TaskCard.tsx';

export interface TaskActions {
  create: (input: TaskInput) => Promise<void>;
  revise: (
    task: TaskRef,
    patch: Partial<Pick<TaskInput, 'title' | 'description' | 'status'>> & {
      dueDate?: string | null;
    },
  ) => Promise<void>;
}
function TaskEditor({
  task,
  actions,
  disabledReason,
  onClose,
  onBusy,
}: {
  task?: TaskRecord;
  actions: TaskActions;
  disabledReason?: string;
  onClose: () => void;
  onBusy: (busy: boolean) => void;
}) {
  const dueDateId = useId();
  const [title, setTitle] = useState(task?.title ?? '');
  const [description, setDescription] = useState(task?.description ?? '');
  const [status, setStatus] = useState(task?.status ?? 'backlog');
  const [dueDate, setDueDate] = useState(task?.dueDate ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const pending = useRef(false);
  const [recovery, setRecovery] = useState<SaveError>();
  const finalized = useRef<SaveError | undefined>(undefined);
  const save = async () => {
    if (pending.current || disabledReason) return;
    pending.current = true;
    setBusy(true);
    onBusy(true);
    setError(undefined);
    try {
      if (recovery) await recovery.retry();
      else if (task)
        await actions.revise(task, { title, description, status, dueDate: dueDate || null });
      else await actions.create({ title, description, status, ...(dueDate && { dueDate }) });
      finalized.current = undefined;
      onClose();
    } catch (failure) {
      if (failure instanceof SaveError) {
        finalized.current = failure;
        setRecovery(failure);
      }
      setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      pending.current = false;
      setBusy(false);
      onBusy(!!finalized.current);
    }
  };
  return (
    <Stack>
      <SettingField label="Task title" description="What needs to be done?">
        <Input
          value={title}
          disabled={busy || !!recovery}
          onChange={(event) => setTitle(event.currentTarget.value)}
        />
      </SettingField>
      <TextBox
        label="Description"
        layout="longform"
        draft={description}
        onDraftChange={setDescription}
        disabled={busy || !!recovery}
      />
      <SettingField
        label="Task status"
        description="Cancelled and abandoned tasks remain outside the active board."
      >
        <Select
          value={status}
          disabled={busy || !!recovery}
          options={taskStatuses.map((value) => ({ value, label: taskStatusLabels[value] }))}
          onChange={(event) => setStatus(event.currentTarget.value as TaskInput['status'])}
        />
      </SettingField>
      <Field>
        <FieldLabel htmlFor={dueDateId}>Due date</FieldLabel>
        <Input
          id={dueDateId}
          type="date"
          value={dueDate}
          disabled={busy || !!recovery}
          onChange={(event) => setDueDate(event.currentTarget.value)}
        />
        <Text size="sm" tone="muted">
          Optional calendar date.
        </Text>
      </Field>
      {!!error && (
        <Text role="alert" tone="danger">
          {error}
        </Text>
      )}
      {!!disabledReason && <Text tone="muted">{disabledReason}</Text>}
      <Row>
        <Button disabled={busy || !!disabledReason || !title.trim()} onClick={save}>
          {busy ? 'Saving…' : recovery ? 'Retry save' : 'Save task'}
        </Button>
        <Button variant="ghost" disabled={busy || !!recovery} onClick={onClose}>
          Cancel
        </Button>
      </Row>
    </Stack>
  );
}
export function TasksPage({
  data,
  error,
  actions,
  disabledReason,
}: {
  data?: TaskData;
  error?: string;
  actions?: TaskActions;
  disabledReason?: string;
}) {
  const [editor, setEditor] = useState<{ task?: TaskRecord }>();
  const [saving, setSaving] = useState(false);
  const [pending, setPending] = useState<TaskRef>();
  const [actionError, setActionError] = useState<string>();
  const moving = useRef(false);
  const identities = useRef(new Map<string, TaskRef>());
  const key = (task: TaskRef) => {
    for (const [id, previous] of identities.current) if (sameEntity(task, previous)) return id;
    const id = crypto.randomUUID();
    identities.current.set(id, task);
    return id;
  };
  const [statusRecovery, setStatusRecovery] = useState<SaveError>();
  const changeStatus = async (task: TaskRecord, status: TaskInput['status']) => {
    if (!actions || disabledReason || moving.current) return;
    moving.current = true;
    setPending(task);
    setActionError(undefined);
    try {
      await actions.revise(task, { status });
    } catch (failure) {
      if (failure instanceof SaveError) setStatusRecovery(failure);
      setActionError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      moving.current = false;
      setPending(undefined);
    }
  };
  const card = (task: TaskRecord) => (
    <TaskCard
      key={key(task)}
      task={task}
      actions={
        actions && (
          <Stack gap="sm">
            <SettingField label={`Move ${task.title}`} description="Choose a status.">
              <Select
                value={task.status}
                disabled={!!disabledReason || !!pending || !!statusRecovery || saving}
                options={taskStatuses.map((value) => ({ value, label: taskStatusLabels[value] }))}
                onChange={(event) => {
                  later(changeStatus(task, event.currentTarget.value as TaskInput['status']));
                }}
              />
            </SettingField>
            <Button
              variant="ghost"
              disabled={!!disabledReason || !!pending || !!statusRecovery || saving}
              aria-label={`Edit ${task.title}`}
              onClick={() => setEditor({ task })}
            >
              Edit
            </Button>
          </Stack>
        )
      }
    />
  );
  const column = (status: TaskInput['status']) => {
    const tasks = data?.filter((task) => task.status === status) ?? [];
    return (
      <Surface key={status} as="section" aria-label={taskStatusLabels[status]}>
        <Stack gap="md">
          <Heading level={2}>
            {taskStatusLabels[status]} · {tasks.length}
          </Heading>
          {tasks.length ? (
            tasks.map(card)
          ) : (
            <Text size="sm" tone="muted">
              No tasks
            </Text>
          )}
        </Stack>
      </Surface>
    );
  };
  const closed =
    data?.filter((task) => task.status === 'cancelled' || task.status === 'abandoned') ?? [];
  return (
    <>
      <FeaturePage
        title="Tasks"
        width="wide"
        actions={
          actions && (
            <Button
              compactIcon="plus"
              size="compact"
              disabled={!!disabledReason || saving || !!statusRecovery}
              onClick={() => setEditor({})}
            >
              Add task
            </Button>
          )
        }
      >
        {!!disabledReason && (
          <Text size="sm" tone="muted">
            {disabledReason}
          </Text>
        )}
        {!!actionError && (
          <Text role="alert" tone="danger">
            {actionError}
          </Text>
        )}
        {!!statusRecovery && (
          <Button
            onClick={() => {
              if (moving.current || disabledReason) return;
              moving.current = true;
              statusRecovery
                .retry()
                .then(() => {
                  setStatusRecovery(undefined);
                  setActionError(undefined);
                })
                .catch((failure: unknown) => setActionError(String(failure)))
                .finally(() => {
                  moving.current = false;
                });
            }}
          >
            Retry status save
          </Button>
        )}
        {error ? (
          <Text role="alert" tone="danger">
            {error}
          </Text>
        ) : !data ? (
          <Loader>Opening tasks…</Loader>
        ) : (
          <Stack gap="xl">
            <Columns count={2}>
              <Columns count={2}>{boardStatuses.slice(0, 2).map(column)}</Columns>
              <Columns count={2}>{boardStatuses.slice(2).map(column)}</Columns>
            </Columns>
            {!!closed.length && (
              <Surface as="section" aria-label="Cancelled and abandoned tasks">
                <Stack gap="md">
                  <Heading level={2}>Cancelled and abandoned</Heading>
                  {closed.map(card)}
                </Stack>
              </Surface>
            )}
          </Stack>
        )}
      </FeaturePage>
      {!!actions && (
        <Overlay
          open={!!editor}
          onClose={() => {
            if (!saving) setEditor(undefined);
          }}
          title={editor?.task ? 'Edit task' : 'Add task'}
          description="Record a task and its current status."
        >
          {!!editor && (
            <TaskEditor
              key={editor.task ? key(editor.task) : 'new'}
              task={editor.task}
              actions={actions}
              disabledReason={disabledReason}
              onClose={() => setEditor(undefined)}
              onBusy={setSaving}
            />
          )}
        </Overlay>
      )}
    </>
  );
}
