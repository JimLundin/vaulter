import { Badge, Stack, Text, Timeline } from '@/ui/kit/index.ts';
import { type CalendarEntry, formatTime } from '@/calendar/presentation.ts';

/** Embeddable Calendar record UI, with no global route, scroll container or storage ownership. */
export function CalendarTimeline({
  entries,
  title = 'Timeline',
}: {
  entries: readonly CalendarEntry[];
  title?: string;
}) {
  return (
    <Timeline
      label={title}
      items={entries.map((entry) => ({
        id: entry.id,
        title: entry.title,
        date: entry.date,
        metadata: <Badge variant="secondary">{entry.status}</Badge>,
        description: entry.description,
        details: entry.event ? (
          <Stack gap="sm">
            {entry.event.reportedTime && (
              <Text size="sm">
                Reported: {formatTime(entry.event.reportedTime, entry.timezone ?? 'UTC')}
              </Text>
            )}
            {entry.event.roles.map((role) => (
              <Text
                key={`${role.kind}:${role.order}:${role.role}:${role.subject.entity}`}
                size="sm"
              >
                {role.kind}: {role.role}
              </Text>
            ))}
            <Text size="sm" tone="muted">
              {entry.event.sources.length
                ? `${entry.event.sources.length} retained source references. Evidence review is not recorded here.`
                : 'No supporting sources recorded.'}
            </Text>
          </Stack>
        ) : undefined,
      }))}
    />
  );
}
