import { useState, useRef, useId } from 'react';
import {
  Button,
  FeaturePage,
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
  const [view, setView] = useState('month');
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
  return (
    <FeaturePage
      title="Calendar"
      description="Plans, occurrences and dates worth remembering."
      width="wide"
    >
      <Stack inset="page" gap="xl" block="md">
        <Heading level={2}>{label}</Heading>
        <PageControls
          actions={
            <Row wrap={true}>
              <Button
                variant="ghost"
                iconOnly={true}
                aria-label="Previous month"
                title="Previous month"
                onClick={() => move(-1)}
              >
                <Icon name="chevron-left" />
              </Button>
              <Button
                variant="ghost"
                iconOnly={true}
                aria-label="Next month"
                title="Next month"
                onClick={() => move(1)}
              >
                <Icon name="chevron-right" />
              </Button>
              {!!actions && (
                <>
                  <Button
                    aria-label="Add event"
                    title="Add event"
                    compactIcon="plus"
                    disabled={!!disabledReason}
                    onClick={() => setEditor({})}
                  >
                    Add event
                  </Button>
                  <Button
                    aria-label="Manage events"
                    title="Manage events"
                    compactIcon="list"
                    variant="outline"
                    disabled={!!disabledReason}
                    onClick={() => setManaging(true)}
                  >
                    Manage events
                  </Button>
                </>
              )}
            </Row>
          }
          filters={{
            type: 'single',
            label: 'Calendar view',
            value: view,
            options: [
              { value: 'month', label: 'Month' },
              { value: 'timeline', label: 'Timeline' },
            ],
            active: view !== 'month',
            onValueChange: (value) => {
              if (value) setView(value);
            },
          }}
        />
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
          <>
            {view === 'month' ? (
              <>
                <MonthCalendar
                  label={label}
                  offset={(new Date(`${window.start}T12:00:00Z`).getUTCDay() + 6) % 7}
                  selected={selected}
                  onSelect={setSelected}
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
                <CalendarTimeline
                  title={selected ? `On ${selected}` : 'This month'}
                  entries={selected ? precise.filter((entry) => entry.day === selected) : precise}
                />
                {!!uncertain.length && (
                  <CalendarTimeline title="Timeframes & approximate dates" entries={uncertain} />
                )}
              </>
            ) : (
              <CalendarTimeline title={label} entries={inMonth} />
            )}
            {!!unknown.length && <CalendarTimeline title="Date unknown" entries={unknown} />}
            {!!actionError && (
              <Text role="alert" tone="danger">
                {actionError}
              </Text>
            )}
          </>
        )}
        <Text size="sm" tone="muted">
          Times shown in {timezone}. Planned events stay planned until an occurrence is recorded.
        </Text>
      </Stack>
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
    </FeaturePage>
  );
}
