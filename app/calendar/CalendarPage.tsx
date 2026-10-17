import { useState, useRef, useId } from 'react';
import {
  Button,
  PageHeader,
  ReadingColumn,
  SplitView,
  SupportingPane,
  PageControls,
  Icon,
  SettingField,
  Field,
  FieldLabel,
  Input,
  Select,
  Stack,
  Row,
  Text,
  TextBox,
  Overlay,
  MonthCalendar,
  Heading,
  Loader,
} from '@/ui/kit/index.ts';
import { CalendarTimeline } from './CalendarTimeline.tsx';
import {
  calendarEntries,
  monthWindow,
  type CalendarData,
  type CalendarEntry,
} from './presentation.ts';
import { daysInMonth, type TimeValue } from './time.ts';
import type { EventInput } from './operations.ts';
import type { EventRef } from './schema.ts';

export interface CalendarActions {
  create: (input: EventInput) => Promise<void>;
  revise: (event: EventRef, input: EventInput) => Promise<void>;
  remove: (event: EventRef) => Promise<void>;
}

function EventEditor({
  entry,
  selectedDay,
  actions,
  onClose,
  onBusy,
}: {
  entry?: CalendarEntry;
  selectedDay?: string;
  actions: CalendarActions;
  onClose: () => void;
  onBusy: (busy: boolean) => void;
}) {
  const original = entry?.event;
  const dateId = useId();
  const [title, setTitle] = useState(original?.title ?? '');
  const [description, setDescription] = useState(original?.description ?? '');
  const [status, setStatus] = useState<EventInput['status']>(original?.status ?? 'planned');
  const [precision, setPrecision] = useState('keep');
  const [date, setDate] = useState(selectedDay ?? '');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const pending = useRef<boolean>(false);
  const save = async () => {
    if (pending.current) return;
    pending.current = true;
    onBusy(true);
    setBusy(true);
    setError(undefined);
    try {
      let time: TimeValue = original?.time ?? { kind: 'unknown' };
      if (precision === 'day') {
        const [year, month, day] = date.split('-').map(Number);
        time = {
          kind: 'point',
          point: { precision: 'day', year: year!, month: month!, day: day! },
          approximate: false,
        };
      }
      if (precision === 'unknown') time = { kind: 'unknown' };
      const input = { title, description, status, time };
      if (original) await actions.revise(original, input);
      else await actions.create(input);
      onClose();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      pending.current = false;
      setBusy(false);
      onBusy(false);
    }
  };
  return (
    <Stack>
      <SettingField label="Event title" description="A short name for this event.">
        <Input
          value={title}
          disabled={busy}
          onChange={(event) => setTitle(event.currentTarget.value)}
        />
      </SettingField>
      <TextBox
        label="Description"
        layout="longform"
        draft={description}
        onDraftChange={setDescription}
        disabled={busy}
      />
      <SettingField
        label="Status"
        description="Passing a date does not change a plan into an occurrence."
      >
        <Select
          value={status}
          disabled={busy}
          options={['planned', 'occurred', 'cancelled', 'unknown'].map((value) => ({
            value,
            label: value,
          }))}
          onChange={(event) => setStatus(event.currentTarget.value as EventInput['status'])}
        />
      </SettingField>
      <SettingField
        label="Date precision"
        description="Keep the recorded precision or explicitly choose a new date."
      >
        <Select
          value={precision}
          disabled={busy}
          options={[
            {
              value: 'keep',
              label: original ? `Keep recorded date: ${entry!.date}` : 'Date unknown',
            },
            { value: 'day', label: 'Exact day' },
            { value: 'unknown', label: 'Date unknown' },
          ]}
          onChange={(event) => setPrecision(event.currentTarget.value)}
        />
      </SettingField>
      {precision === 'day' && (
        <Field>
          <FieldLabel htmlFor={dateId}>Event date</FieldLabel>
          <Input
            id={dateId}
            type="date"
            value={date}
            disabled={busy}
            onChange={(event) => setDate(event.currentTarget.value)}
          />
        </Field>
      )}
      {!!error && (
        <Text role="alert" tone="danger">
          {error}
        </Text>
      )}
      <Row>
        <Button disabled={busy || !title.trim()} onClick={save}>
          {busy ? 'Saving…' : 'Save event'}
        </Button>
        <Button variant="ghost" disabled={busy} onClick={onClose}>
          Cancel
        </Button>
      </Row>
    </Stack>
  );
}

export function CalendarPage({
  data,
  error,
  actions,
  disabledReason,
  initialMonth,
}: {
  data?: CalendarData;
  error?: string;
  actions?: CalendarActions;
  disabledReason?: string;
  initialMonth?: string;
}) {
  const [month, setMonth] = useState(initialMonth ?? new Date().toISOString().slice(0, 7));
  const [timelineOpen, setTimelineOpen] = useState(false);
  const [selected, setSelected] = useState<string>();
  const [editor, setEditor] = useState<{ entry?: CalendarEntry }>();
  const [actionError, setActionError] = useState<string>();
  const [removing, setRemoving] = useState(false);
  const [saving, setSaving] = useState(false);
  const [managing, setManaging] = useState(false);
  const [removeEntry, setRemoveEntry] = useState<CalendarEntry>();
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const window = monthWindow(month);
  const entries = data ? calendarEntries(data, window.year, timezone) : [];
  const inMonth = entries.filter(
    (entry) =>
      entry.coverage && entry.coverage.start <= window.end && entry.coverage.end >= window.start,
  );
  const precise = inMonth.filter((entry) => entry.exactDay);
  const uncertain = inMonth.filter((entry) => !entry.exactDay);
  const unknown = entries.filter((entry) => !entry.coverage);
  const label = new Intl.DateTimeFormat('en', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${window.start}T12:00:00Z`));
  const move = (direction: number) => {
    const next = new Date(`${window.start}T12:00:00Z`);
    next.setUTCMonth(next.getUTCMonth() + direction);
    setMonth(next.toISOString().slice(0, 7));
    setSelected(undefined);
  };
  const add = actions ? (
    <Button
      aria-label="Add event"
      title="Add event"
      compactIcon="plus"
      size="compact"
      disabled={!!disabledReason}
      onClick={() => setEditor({})}
    >
      Add event
    </Button>
  ) : null;
  const manage = actions ? (
    <Button
      aria-label="Manage events"
      title="Manage events"
      compactIcon="edit"
      size="compact"
      variant="ghost"
      disabled={!!disabledReason}
      onClick={() => setManaging(true)}
    >
      Manage events
    </Button>
  ) : null;
  const previous = (
    <Button
      variant="ghost"
      iconOnly={true}
      aria-label="Previous month"
      title="Previous month"
      onClick={() => move(-1)}
    >
      <Icon name="chevron-left" />
    </Button>
  );
  const next = (
    <Button
      variant="ghost"
      iconOnly={true}
      aria-label="Next month"
      title="Next month"
      onClick={() => move(1)}
    >
      <Icon name="chevron-right" />
    </Button>
  );
  const chronology = (
    <Stack gap="xl">
      {!!selected && (
        <Button variant="ghost" size="compact" onClick={() => setSelected(undefined)}>
          Show whole month
        </Button>
      )}
      <CalendarTimeline
        title={selected ? `On ${selected}` : 'This month'}
        entries={selected ? precise.filter((entry) => entry.day === selected) : precise}
      />
      {!!uncertain.length && (
        <CalendarTimeline title="Timeframes & approximate dates" entries={uncertain} />
      )}
      {!!unknown.length && <CalendarTimeline title="Date unknown" entries={unknown} />}
      <Text size="sm" tone="muted">
        Times shown in {timezone}. Planned events stay planned until an occurrence is recorded.
      </Text>
    </Stack>
  );
  return (
    <>
      <PageControls
        placement="rail"
        bottomActions={
          <>
            {previous}
            <Text size="sm">{label}</Text>
            {next}
          </>
        }
        actions={
          <Row>
            {add}
            {manage}
            <Button
              variant="ghost"
              iconOnly={true}
              aria-label="Open timeline"
              title="Open timeline"
              onClick={() => setTimelineOpen(true)}
            >
              <Icon name="list" />
            </Button>
          </Row>
        }
      />
      <SplitView
        main={
          <ReadingColumn label="Calendar workspace">
            <PageHeader title="Calendar" />
            <Stack grow={true} inset="page" block="md" gap="md">
              <Row justify="between">
                <Heading level={2}>{label}</Heading>
                <PageControls
                  placement="expanded"
                  actions={
                    <Row gap="xs">
                      {previous}
                      {next}
                    </Row>
                  }
                />
              </Row>
              {!!disabledReason && (
                <Text size="sm" tone="muted">
                  {disabledReason}
                </Text>
              )}
              {error ? (
                <Text role="alert" tone="danger">
                  {error}
                </Text>
              ) : !data ? (
                <Loader>Opening calendar…</Loader>
              ) : (
                <MonthCalendar
                  fit={true}
                  label={label}
                  offset={(new Date(`${window.start}T12:00:00Z`).getUTCDay() + 6) % 7}
                  selected={selected}
                  onSelect={(day) => {
                    setSelected(day);
                    setTimelineOpen(true);
                  }}
                  days={Array.from(
                    { length: daysInMonth(window.year, window.month) },
                    (_, index) => {
                      const date = `${month}-${String(index + 1).padStart(2, '0')}`;
                      return {
                        date,
                        number: index + 1,
                        label: `${index + 1} ${label}`,
                        items: precise.filter((entry) => entry.day === date),
                      };
                    },
                  )}
                />
              )}
            </Stack>
          </ReadingColumn>
        }
        supporting={
          <SupportingPane
            title="Timeline"
            open={timelineOpen}
            persistent={true}
            onClose={() => setTimelineOpen(false)}
            selection={selected ?? month}
          >
            <Stack gap="xl">
              <PageControls
                placement="expanded"
                actions={
                  <Stack gap="sm">
                    {add}
                    {manage}
                  </Stack>
                }
              />
              {!!actionError && (
                <Text role="alert" tone="danger">
                  {actionError}
                </Text>
              )}
              {data ? chronology : <Loader>Opening timeline…</Loader>}
            </Stack>
          </SupportingPane>
        }
      />
      <Overlay
        open={managing}
        onClose={() => setManaging(false)}
        title="Manage events"
        description="Edit or remove events in the selected month, including undated events."
      >
        {!!actions && (
          <Stack gap="sm">
            {entries
              .filter((entry) => entry.event && (!entry.coverage || inMonth.includes(entry)))
              .map((entry) => (
                <Row key={entry.id} wrap={true} justify="between">
                  <Text>{entry.title}</Text>
                  <Row>
                    <Button
                      variant="outline"
                      disabled={!!disabledReason || removing}
                      aria-label={`Edit ${entry.title}`}
                      onClick={() => {
                        setManaging(false);
                        setEditor({ entry });
                      }}
                    >
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      disabled={!!disabledReason || removing}
                      aria-label={`Remove ${entry.title}`}
                      onClick={() => {
                        setManaging(false);
                        setRemoveEntry(entry);
                      }}
                    >
                      Remove
                    </Button>
                  </Row>
                </Row>
              ))}
          </Stack>
        )}
      </Overlay>
      {!!actions && (
        <Overlay
          open={!!editor}
          onClose={() => {
            if (!saving) setEditor(undefined);
          }}
          title={editor?.entry ? 'Edit event' : 'Add event'}
          description="Record what is known about the event."
        >
          {!!editor && (
            <EventEditor
              key={editor.entry?.id ?? 'new'}
              entry={editor.entry}
              selectedDay={selected}
              actions={actions}
              onClose={() => setEditor(undefined)}
              onBusy={setSaving}
            />
          )}
        </Overlay>
      )}
      {!!actions && (
        <Overlay
          open={!!removeEntry}
          onClose={() => {
            if (!removing) setRemoveEntry(undefined);
          }}
          title="Remove event"
          description="The event will leave Calendar. Its recorded history remains."
        >
          <Text>{removeEntry?.title}</Text>
          <Row>
            <Button
              disabled={removing}
              onClick={() => {
                if (!removeEntry?.event) return;
                setRemoving(true);
                actions
                  .remove(removeEntry.event)
                  .then(() => setRemoveEntry(undefined))
                  .catch((failure: unknown) => setActionError(String(failure)))
                  .finally(() => setRemoving(false));
              }}
            >
              {removing ? 'Removing…' : 'Remove event'}
            </Button>
            <Button variant="ghost" disabled={removing} onClick={() => setRemoveEntry(undefined)}>
              Keep event
            </Button>
          </Row>
          {!!actionError && (
            <Text role="alert" tone="danger">
              {actionError}
            </Text>
          )}
        </Overlay>
      )}
    </>
  );
}
