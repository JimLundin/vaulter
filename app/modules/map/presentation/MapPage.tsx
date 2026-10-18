import { useMemo, useRef, useState } from 'react';
import {
  Button,
  PageHeader,
  ReadingColumn,
  SplitView,
  SupportingPane,
  PageControls,
  SettingField,
  Input,
  Select,
  Stack,
  Row,
  Text,
  Overlay,
  Heading,
  Loader,
  MapView,
  SelectionRow,
  Surface,
  Separator,
} from '@/shared/ui/kit/index.ts';
import type { CoordinateInput } from '@/modules/map/operations.ts';
import type { CoordinateValue } from '@/modules/map/coordinates.ts';
import { decimalDegrees, parseCoordinates } from '@/modules/map/coordinates.ts';
import type { CoordinateRef } from '@/modules/map/records.ts';
import { mapMarkers, type MapData, type MapEntry } from '@/modules/map/view.ts';

export interface MapActions {
  create: (input: CoordinateInput) => Promise<void>;
  revise: (record: CoordinateRef, coordinates: CoordinateValue) => Promise<void>;
  remove: (record: CoordinateRef) => Promise<void>;
}

function CoordinateEditor({
  entry,
  data,
  actions,
  onClose,
  onBusy,
}: {
  entry?: MapEntry;
  data: MapData;
  actions: MapActions;
  onClose: () => void;
  onBusy: (busy: boolean) => void;
}) {
  const original = entry?.record.coordinates;
  const [subject, setSubject] = useState('');
  const [latitude, setLatitude] = useState(
    original ? String(decimalDegrees(original.latitude)) : '',
  );
  const [longitude, setLongitude] = useState(
    original ? String(decimalDegrees(original.longitude)) : '',
  );
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const pending = useRef<boolean>(false);
  const save = async () => {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    onBusy(true);
    setError(undefined);
    try {
      if (!(latitude.trim() && longitude.trim()))
        throw new Error('Enter both latitude and longitude.');
      const changed =
        !original ||
        latitude !== String(decimalDegrees(original.latitude)) ||
        longitude !== String(decimalDegrees(original.longitude));
      const coordinates = changed
        ? parseCoordinates({
            kind: 'geographic',
            crs: 'EPSG:4326',
            latitude: Number(latitude),
            longitude: Number(longitude),
          })
        : original;
      if (entry) await actions.revise(entry.record, coordinates);
      else {
        const target = data.subjects[Number(subject)];
        if (subject === '' || !target)
          throw new Error('Choose a record to attach these coordinates to.');
        await actions.create({ subject: target.reference, coordinates });
      }
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
      {entry ? (
        <Text>Attached to {entry.label}</Text>
      ) : (
        <SettingField
          label="Attach to record"
          description="Choose the record this location describes."
        >
          <Select
            value={subject}
            disabled={busy}
            options={[
              { value: '', label: 'Choose a record' },
              ...data.subjects.map((target, index) => ({
                value: String(index),
                label: target.label,
              })),
            ]}
            onChange={(event) => setSubject(event.currentTarget.value)}
          />
        </SettingField>
      )}
      <SettingField label="Latitude" description="Decimal degrees, from −90 to 90.">
        <Input
          inputMode="decimal"
          value={latitude}
          disabled={busy}
          onChange={(event) => setLatitude(event.currentTarget.value)}
        />
      </SettingField>
      <SettingField label="Longitude" description="Decimal degrees, from −180 to 180.">
        <Input
          inputMode="decimal"
          value={longitude}
          disabled={busy}
          onChange={(event) => setLongitude(event.currentTarget.value)}
        />
      </SettingField>
      {!!error && (
        <Text role="alert" tone="danger">
          {error}
        </Text>
      )}
      <Row>
        <Button disabled={busy} onClick={save}>
          {busy ? 'Saving…' : 'Save coordinates'}
        </Button>
        <Button variant="ghost" disabled={busy} onClick={onClose}>
          Cancel
        </Button>
      </Row>
    </Stack>
  );
}

export function MapPage({
  data,
  error,
  actions,
  disabledReason,
}: {
  data?: MapData;
  error?: string;
  actions?: MapActions;
  disabledReason?: string;
}) {
  const [selected, setSelected] = useState<string>();
  const [open, setOpen] = useState(false);
  const [editor, setEditor] = useState<{ entry?: MapEntry } | undefined>(undefined);
  const [removal, setRemoval] = useState<MapEntry>();
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string>();
  const markers = useMemo(() => mapMarkers(data?.entries ?? []), [data]);
  const entry = data?.entries.find((item) => item.id === selected);
  const add = (
    <Button
      compactIcon="plus"
      size="compact"
      variant="outline"
      aria-label="Add coordinates"
      title="Add coordinates"
      disabled={!(actions && data?.subjects.length) || !!disabledReason}
      onClick={() => setEditor({})}
    >
      Add coordinates
    </Button>
  );
  const pick = (id: string) => {
    setSelected(id);
    setOpen(true);
  };
  return (
    <>
      <PageControls
        placement="rail"
        actions={
          <Row>
            {add}
            <Button
              variant="ghost"
              compactIcon="list"
              aria-label="Open coordinates"
              title="Open coordinates"
              onClick={() => setOpen(true)}
            >
              Coordinates
            </Button>
          </Row>
        }
      />
      <SplitView
        main={
          <ReadingColumn label="Map workspace">
            <PageHeader title="Map" />
            {error ? (
              <Text role="alert" tone="danger">
                {error}
              </Text>
            ) : !data ? (
              <Loader>Opening map…</Loader>
            ) : (
              <MapView markers={markers} selected={selected} onSelect={pick} />
            )}
          </ReadingColumn>
        }
        supporting={
          <SupportingPane
            title="Coordinates"
            persistent={true}
            open={open}
            onClose={() => setOpen(false)}
            selection={selected}
          >
            <Stack gap="lg">
              <PageControls
                placement="expanded"
                actions={
                  <Row justify="between">
                    <Text size="sm" tone="muted">
                      {data?.entries.length ?? 0} locations
                    </Text>
                    {add}
                  </Row>
                }
              />
              {!!disabledReason && (
                <Text tone="muted" size="sm">
                  {disabledReason}
                </Text>
              )}
              {!!entry && (
                <Surface variant="subtle" as="section" aria-label="Selected location">
                  <Stack gap="sm">
                    <Heading level={2}>{entry.label}</Heading>
                    <Text size="sm" tone="muted" mono={true}>
                      {decimalDegrees(entry.record.coordinates.latitude).toFixed(6)},{' '}
                      {decimalDegrees(entry.record.coordinates.longitude).toFixed(6)}
                    </Text>
                    <Row wrap={true}>
                      <Button
                        size="compact"
                        variant="outline"
                        disabled={!actions || !!disabledReason}
                        onClick={() => setEditor({ entry })}
                      >
                        Edit coordinates
                      </Button>
                      <Button
                        size="compact"
                        variant="ghost"
                        disabled={!actions || !!disabledReason}
                        onClick={() => {
                          setActionError(undefined);
                          setRemoval(entry);
                        }}
                      >
                        Remove coordinates
                      </Button>
                    </Row>
                  </Stack>
                </Surface>
              )}
              <Separator />
              <Stack gap="xs">
                <Heading level={3}>Saved coordinates</Heading>
                {data && !data.entries.length && (
                  <Text tone="muted">
                    No coordinates yet. Attach a location to a vault record to place it on the map.
                  </Text>
                )}
                {data && !data.subjects.length && (
                  <Text size="sm" tone="muted">
                    Create a record in Wiki or Calendar first.
                  </Text>
                )}
                {data?.entries.map((item) => (
                  <SelectionRow
                    key={item.id}
                    compact={true}
                    selected={item.id === selected}
                    onSelect={() => pick(item.id)}
                    aria-label={`Select ${item.label}`}
                  >
                    <Stack gap="xs">
                      <Text as="span" size="sm" weight="medium">
                        {item.label}
                      </Text>
                      <Text as="span" size="xs" tone="muted" mono={true}>
                        {decimalDegrees(item.record.coordinates.latitude).toFixed(4)},{' '}
                        {decimalDegrees(item.record.coordinates.longitude).toFixed(4)}
                      </Text>
                    </Stack>
                  </SelectionRow>
                ))}
              </Stack>
            </Stack>
          </SupportingPane>
        }
      />
      <Overlay
        open={!!editor}
        onClose={() => {
          if (!busy) setEditor(undefined);
        }}
        title={editor?.entry ? 'Edit coordinates' : 'Add coordinates'}
        description="Save a location attached to a vault record."
      >
        {!!editor && !!data && !!actions && (
          <CoordinateEditor
            entry={editor.entry}
            data={data}
            actions={actions}
            onClose={() => setEditor(undefined)}
            onBusy={setBusy}
          />
        )}
      </Overlay>
      <Overlay
        open={!!removal}
        onClose={() => {
          if (!busy) setRemoval(undefined);
        }}
        title="Remove coordinates"
        description="The location will leave the map. Its recorded history remains."
      >
        <Stack>
          <Text>{removal?.label}</Text>
          <Row>
            <Button
              disabled={busy || !!disabledReason}
              onClick={() => {
                if (!(removal && actions) || busy) return;
                setBusy(true);
                actions
                  .remove(removal.record)
                  .then(() => {
                    setRemoval(undefined);
                    setSelected(undefined);
                  })
                  .catch((failure: unknown) => setActionError(String(failure)))
                  .finally(() => setBusy(false));
              }}
            >
              {busy ? 'Removing…' : 'Remove coordinates'}
            </Button>
            <Button variant="ghost" disabled={busy} onClick={() => setRemoval(undefined)}>
              Keep coordinates
            </Button>
          </Row>
          {!!actionError && (
            <Text role="alert" tone="danger">
              {actionError}
            </Text>
          )}
        </Stack>
      </Overlay>
    </>
  );
}
