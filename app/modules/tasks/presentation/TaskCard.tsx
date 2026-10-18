import type { ReactNode } from 'react';
import { Surface, Stack, Heading, Text } from '@/shared/ui/kit/index.ts';
import { taskStatusLabels, type TaskRecord } from '@/modules/tasks/index.ts';

/** The board and callers embedding a Task share its retained meaning and presentation. */
export function TaskCard({ task, actions }: { task: TaskRecord; actions?: ReactNode }) {
  return (
    <Surface as="section" variant="subtle" aria-label={task.title}>
      <Stack gap="sm">
        <Heading level={3}>{task.title}</Heading>
        {!!task.description && <Text>{task.description}</Text>}
        <Text size="sm" tone="muted">
          {taskStatusLabels[task.status]}
          {task.dueDate ? ` · Due ${task.dueDate}` : ''}
        </Text>
        {!task.available && (
          <Text size="sm" tone="muted">
            Unavailable
          </Text>
        )}
        {actions}
      </Stack>
    </Surface>
  );
}
