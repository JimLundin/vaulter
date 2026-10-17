// Throwaway comparison: three desktop control arrangements, each with a shared right timeline pane.
// Lives on the regular /calendar/ route only when ?compare=calendar is present. Writes stay local.
import { useState, type ComponentProps } from 'react';
import {
  Button,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  Heading,
  Icon,
  Input,
  Loader,
  MonthCalendar,
  Overlay,
  PageControls,
  PageHeader,
  ReadingColumn,
  Row,
  SettingField,
  SplitView,
  Stack,
  SupportingPane,
  Text,
} from '@/ui/kit/index.ts';
import {
  CalendarTimeline,
  calendarEntries,
  type CalendarPage,
  type CalendarEntry,
} from '@/calendar/index.ts';
import { daysInMonth } from '@/calendar/time.ts';

type Layout = 'toolbar' | 'pane' | 'minimal';
type Props = ComponentProps<typeof CalendarPage>;

export function CalendarLayoutPrototype({ data, error, layout }: Props & { layout: Layout }) {
  const [month, setMonth] = useState('2026-10');
  const [selected, setSelected] = useState<string>();
  const [timelineOpen, setTimelineOpen] = useState(false);
  const [dialog, setDialog] = useState<'add' | 'manage'>();
  const [title, setTitle] = useState('');
  const [added, setAdded] = useState<CalendarEntry[]>([]);
  const [hidden, setHidden] = useState<string[]>([]);
  const [year, monthNumber] = month.split('-').map(Number);
  const count = daysInMonth(year!, monthNumber!);
  const start = `${month}-01`;
  const end = `${month}-${count}`;
  const label = new Intl.DateTimeFormat('en', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${start}T12:00:00Z`));
  const entries = [
    ...(data ? calendarEntries(data, year!, 'Europe/Stockholm') : []),
    ...added,
  ].filter((entry) => !hidden.includes(entry.id));
  const inMonth = entries.filter(
    (entry) => entry.coverage && entry.coverage.start <= end && entry.coverage.end >= start,
  );
  const precise = inMonth.filter((entry) => entry.exactDay);
  const uncertain = inMonth.filter((entry) => !entry.exactDay);
  const unknown = entries.filter((entry) => !entry.coverage);
  const move = (direction: number) => {
    const next = new Date(`${start}T12:00:00Z`);
    next.setUTCMonth(next.getUTCMonth() + direction);
    setMonth(next.toISOString().slice(0, 7));
    setSelected(undefined);
  };
  const navigation = (
    <Row gap="xs">
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
    </Row>
  );
  const add = (
    <Button
      size="compact"
      compactIcon="plus"
      aria-label="Add event"
      title="Add event"
      onClick={() => setDialog('add')}
    >
      Add event
    </Button>
  );
  const manage = (
    <Button
      size="compact"
      variant="ghost"
      compactIcon="edit"
      aria-label="Manage events"
      title="Manage events"
      onClick={() => setDialog('manage')}
    >
      Manage events
    </Button>
  );
  const openTimeline = (
    <Button
      size="compact"
      variant="ghost"
      iconOnly={true}
      aria-label="Open timeline"
      title="Open timeline"
      onClick={() => setTimelineOpen(true)}
    >
      <Icon name="list" />
    </Button>
  );
  const rail = (
    <PageControls
      placement="rail"
      bottomActions={
        <>
          <Button
            variant="ghost"
            iconOnly={true}
            aria-label="Previous month"
            onClick={() => move(-1)}
          >
            <Icon name="chevron-left" />
          </Button>
          <Text size="sm">{label}</Text>
          <Button variant="ghost" iconOnly={true} aria-label="Next month" onClick={() => move(1)}>
            <Icon name="chevron-right" />
          </Button>
        </>
      }
      actions={
        <Row>
          {add}
          {manage}
          {openTimeline}
        </Row>
      }
    />
  );
  const calendar = (
    <MonthCalendar
      fit={true}
      label={label}
      offset={(new Date(`${start}T12:00:00Z`).getUTCDay() + 6) % 7}
      selected={selected}
      onSelect={(date) => {
        setSelected(date);
        setTimelineOpen(true);
      }}
      days={Array.from({ length: count }, (_, index) => {
        const date = `${month}-${String(index + 1).padStart(2, '0')}`;
        return {
          date,
          number: index + 1,
          label: `${index + 1} ${label}`,
          items: precise.filter((entry) => entry.day === date),
        };
      })}
    />
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
    </Stack>
  );
  const pane = (
    <SupportingPane
      title="Timeline"
      open={timelineOpen}
      persistent={true}
      onClose={() => setTimelineOpen(false)}
      selection={selected ?? month}
    >
      <Stack gap="xl">
        {layout === 'pane' && (
          <PageControls
            placement="expanded"
            actions={
              <Stack gap="sm">
                {add}
                {manage}
              </Stack>
            }
          />
        )}
        {chronology}
      </Stack>
    </SupportingPane>
  );
  const compactToolbar = (
    <Row justify="between" wrap={true}>
      <Row gap="sm">
        <Heading level={2}>{label}</Heading>
        <PageControls placement="expanded" actions={navigation} />
      </Row>
      <PageControls
        placement="expanded"
        actions={
          <Row gap="xs">
            {add}
            {manage}
          </Row>
        }
      />
    </Row>
  );
  const paneToolbar = (
    <Row justify="between" wrap={true}>
      <Heading level={2}>{label}</Heading>
      <PageControls placement="expanded" actions={navigation} />
    </Row>
  );
  const minimalToolbar = (
    <Row justify="between" wrap={true}>
      <Row gap="sm">
        <PageControls placement="expanded" actions={navigation} />
        <Heading level={2}>{label}</Heading>
      </Row>
      <PageControls
        placement="expanded"
        actions={
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="ghost"
                  iconOnly={true}
                  aria-label="Calendar actions"
                  title="Calendar actions"
                >
                  <Icon name="more" />
                </Button>
              }
            />
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setDialog('add')}>Add event</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setDialog('manage')}>Manage events</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        }
      />
    </Row>
  );
  return (
    <>
      {rail}
      <SplitView
        main={
          <ReadingColumn label="Calendar workspace">
            <PageHeader title="Calendar" />
            <Stack grow={true} gap="md" inset="page" block="md">
              <Stack gap="none">
                {layout === 'toolbar'
                  ? compactToolbar
                  : layout === 'pane'
                    ? paneToolbar
                    : minimalToolbar}
              </Stack>
              {error ? (
                <Text role="alert" tone="danger">
                  {error}
                </Text>
              ) : !data ? (
                <Loader>Opening calendar…</Loader>
              ) : (
                calendar
              )}
            </Stack>
          </ReadingColumn>
        }
        supporting={pane}
      />
      <Overlay
        open={!!dialog}
        onClose={() => setDialog(undefined)}
        title={dialog === 'add' ? 'Add event' : 'Manage events'}
        description="Prototype actions affect this comparison only."
      >
        {dialog === 'add' ? (
          <Stack>
            <SettingField
              label="Event title"
              description="Try adding an event to the selected day."
            >
              <Input value={title} onChange={(event) => setTitle(event.currentTarget.value)} />
            </SettingField>
            <Button
              disabled={!title.trim()}
              onClick={() => {
                const day = selected ?? `${month}-24`;
                setAdded((current) => [
                  ...current,
                  {
                    id: crypto.randomUUID(),
                    title,
                    date: day,
                    status: 'planned',
                    exactDay: true,
                    day,
                    coverage: { start: day, end: day },
                  },
                ]);
                setTitle('');
                setDialog(undefined);
                setTimelineOpen(true);
              }}
            >
              Save event
            </Button>
          </Stack>
        ) : (
          <Stack>
            {[...inMonth, ...unknown].map((entry) => (
              <Row key={entry.id} justify="between">
                <Text>{entry.title}</Text>
                <Button
                  variant="ghost"
                  onClick={() => setHidden((current) => [...current, entry.id])}
                >
                  Remove
                </Button>
              </Row>
            ))}
          </Stack>
        )}
      </Overlay>
    </>
  );
}

export function CalendarToolbarPrototype(props: Props) {
  return <CalendarLayoutPrototype {...props} layout="toolbar" />;
}
export function CalendarPanePrototype(props: Props) {
  return <CalendarLayoutPrototype {...props} layout="pane" />;
}
export function CalendarMinimalPrototype(props: Props) {
  return <CalendarLayoutPrototype {...props} layout="minimal" />;
}
