import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { EmbeddedObservation } from './index.ts';
import { parseObservation } from '@/modules/observations/index.ts';

test('embedded measurements show recorded missing values, collection failure and removal without asserting presence', () => {
  const measured = renderToStaticMarkup(
    <EmbeddedObservation
      record={{
        available: false,
        value: parseObservation({
          subject: 'weather',
          source: { kind: 'application', name: 'Collector' },
          time: { requested: null, observed: '2026-10-04T22:05:00+02:00' },
          outcome: {
            status: 'collected',
            value: { latitude: 59.3, temperatureC: 0, daylight: false, raw: { temp_c: 0 } },
            quality: { method: 'coordinates of the place page' },
          },
        }),
      }}
    />,
  );
  expect(measured).toContain('Removed observation');
  expect(measured).toContain('requested: Recorded as missing');
  expect(measured).not.toContain('received:');
  expect(measured).toContain('2026-10-04T22:05:00+02:00');
  expect(measured).toContain('Temperature (°C): 0');
  expect(measured).toContain('Daylight: No');
  expect(measured).toContain('Measurement latitude: 59.3');
  expect(measured).toContain('coordinates of the place page');
  expect(measured).toContain('temp_c');
  const failed = renderToStaticMarkup(
    <EmbeddedObservation
      record={{
        available: true,
        value: parseObservation({
          subject: 'session',
          source: { kind: 'application' },
          time: {},
          outcome: { status: 'failed', reason: 'Connection lost', value: null },
        }),
      }}
    />,
  );
  expect(failed).toContain('Outcome: failed');
  expect(failed).toContain('Connection lost');
  expect(failed).toContain('Measurements: Recorded as missing');
});
