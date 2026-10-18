import { Card, CardContent, CardHeader, CardTitle, Stack, Text } from '@/shared/ui/kit/index.ts';
import type { ObservationRecord } from '@/modules/observations/index.ts';

const labels: Record<string, string> = {
  elapsedMs: 'Elapsed (ms)',
  requested: 'requested',
  observed: 'observed',
  received: 'received',
  host: 'Host',
  os: 'Operating system',
  kernel: 'Kernel',
  arch: 'Architecture',
  user: 'User',
  shell: 'Shell',
  node: 'Node version',
  timezone: 'Timezone',
  session: 'Session',
  entrypoint: 'Entrypoint',
  effort: 'Effort',
  turns: 'Turns',
  latitude: 'Measurement latitude',
  longitude: 'Measurement longitude',
  intervalSeconds: 'Interval (seconds)',
  temperatureC: 'Temperature (°C)',
  apparentTemperatureC: 'Apparent temperature (°C)',
  humidityPercent: 'Humidity (%)',
  precipitationMm: 'Precipitation (mm)',
  cloudPercent: 'Cloud (%)',
  windMps: 'Wind (m/s)',
  daylight: 'Daylight',
};
function display(value: unknown): string {
  if (value === null) return 'Recorded as missing';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return typeof value === 'object' ? JSON.stringify(value) : String(value);
}
/** Callers supply the owner's current or pinned historical reading; this view performs no queries. */
export function EmbeddedObservation({
  record,
}: {
  record: Pick<ObservationRecord, 'value' | 'available'>;
}) {
  const { value, available } = record;
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {value.subject[0]!.toUpperCase() + value.subject.slice(1)} observation
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Stack>
          {!available && <Text tone="muted">Removed observation · retained recorded values</Text>}
          <Text>Outcome: {value.outcome.status}</Text>
          <Text>Source: {value.source.name ?? value.source.kind}</Text>
          {Object.entries(value.time).map(([key, reading]) => (
            <Text key={key}>
              {labels[key]}: {display(reading)}
            </Text>
          ))}
          {value.outcome.reason !== undefined && (
            <Text>Reason: {display(value.outcome.reason)}</Text>
          )}
          {value.outcome.value === null && <Text>Measurements: Recorded as missing</Text>}
          {!!value.outcome.value &&
            Object.entries(value.outcome.value)
              .filter(([key]) => key !== 'raw')
              .map(([key, reading]) => (
                <Text key={key}>
                  {labels[key] ?? key}: {display(reading)}
                </Text>
              ))}
          {value.outcome.quality !== undefined && (
            <Text>Quality: {display(value.outcome.quality)}</Text>
          )}
          {value.subject === 'weather' && value.outcome.value?.raw !== undefined && (
            <Text>Raw measurements: {display(value.outcome.value.raw)}</Text>
          )}
        </Stack>
      </CardContent>
    </Card>
  );
}
