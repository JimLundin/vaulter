// @vitest-environment happy-dom
import { afterEach, expect, test, vi } from 'vitest';
import {
  browserObservationCollectors,
  collectObservations,
  observationCollector,
} from './observations.ts';
import { canonical } from '../../vault/nodes/json.ts';
import type { ObservationData } from '../../vault/documents/chat-metadata.ts';

const originalLocation = Object.getOwnPropertyDescriptor(navigator, 'geolocation');
const originalBattery = Object.getOwnPropertyDescriptor(navigator, 'getBattery');
afterEach(() => {
  if (originalLocation) Object.defineProperty(navigator, 'geolocation', originalLocation);
  else Reflect.deleteProperty(navigator, 'geolocation');
  if (originalBattery) Object.defineProperty(navigator, 'getBattery', originalBattery);
  else Reflect.deleteProperty(navigator, 'getBattery');
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
async function all(stream: AsyncGenerator<ObservationData>) {
  const values: ObservationData[] = [];
  for await (const value of stream) values.push(value);
  return values;
}

test('observations stream immediately and keep completion order, failures and timeouts explicit', async () => {
  let release!: () => void;
  const hold = new Promise<void>((resolve) => {
    release = resolve;
  });
  const source = { kind: 'application' as const, name: 'test', version: '1' };
  let slowSignal: AbortSignal | undefined;
  const collectors = [
    observationCollector({
      subject: 'connectivity',
      source,
      collect: async (signal) => {
        slowSignal = signal;
        await hold;
        return {
          observed: '2026-10-10T11:15:00Z',
          outcome: { status: 'collected', value: { online: true } },
        };
      },
    }),
    observationCollector({
      subject: 'location',
      source,
      collect: () =>
        Promise.resolve({
          observed: null,
          outcome: { status: 'denied', reason: { code: 'permission' } },
        }),
    }),
    observationCollector({
      subject: 'power',
      source,
      enabled: false,
      collect: () => {
        throw new Error('Must not run');
      },
    }),
    observationCollector({
      subject: 'app',
      source,
      collect: () => Promise.reject(new Error('Unavailable')),
    }),
  ];
  const stream = collectObservations(collectors, { timeoutMs: 50 });
  const first = await stream.next();
  expect(first.value?.subject).toBe('power');
  const rest = await all(stream);
  expect(rest.map((item) => item.outcome.status)).toEqual(['denied', 'failed', 'timedOut']);
  expect(slowSignal?.aborted).toBe(true);
  release();
  expect(Object.isFrozen(rest[0].time)).toBe(true);
});

test('invalid collector output becomes failure instead of hanging or accepting malformed measurements', async () => {
  const records = await all(
    collectObservations([
      observationCollector({
        subject: 'location',
        source: { kind: 'browser', name: 'fixture' },
        collect: () =>
          Promise.resolve({
            observed: '2026-10-10T11:15:00Z',
            outcome: {
              status: 'collected',
              value: {
                latitude: 300,
                longitude: 17.6,
                accuracyM: 5,
                altitudeM: null,
                altitudeAccuracyM: null,
                speedMps: null,
                headingDegrees: null,
              },
            },
          }),
      }),
    ]),
  );
  expect(records[0].outcome.status).toBe('failed');
});

test('browser collectors retain cached fix time, stationary speed, provider time, and finite power values', async () => {
  const location = vi.fn((success: PositionCallback) =>
    success({
      timestamp: Date.parse('2026-10-10T11:12:00Z'),
      coords: {
        latitude: 59.8,
        longitude: 17.6,
        accuracy: 20,
        altitude: null,
        altitudeAccuracy: null,
        speed: 0,
        heading: Number.NaN,
        toJSON: () => ({}),
      },
      toJSON: () => ({}),
    }),
  );
  Object.defineProperty(navigator, 'geolocation', {
    configurable: true,
    value: { getCurrentPosition: location },
  });
  Object.defineProperty(navigator, 'getBattery', {
    configurable: true,
    value: () =>
      Promise.resolve({
        level: 0.8,
        charging: false,
        chargingTime: Number.POSITIVE_INFINITY,
        dischargingTime: 3000,
      }),
  });
  const fetchFn = vi.fn<typeof fetch>((url) =>
    Promise.resolve(
      Response.json(
        String(url).includes('nominatim')
          ? { display_name: 'Fixture address', address: { city: 'Fixture town' } }
          : {
              current: {
                time: Date.parse('2026-10-10T11:00:00Z') / 1000,
                interval: 900,
                temperature_2m: 12,
                is_day: 1,
                pm2_5: 3,
              },
            },
      ),
    ),
  );
  const records = await all(
    collectObservations(
      browserObservationCollectors({
        installation: 'fixture-installation',
        app: { feature: 'agent', entry: 'direct' },
        fetch: fetchFn,
      }),
    ),
  );
  expect(location).toHaveBeenCalledTimes(1);
  expect(records).toHaveLength(10);
  const fix = records.find((item) => item.subject === 'location')!;
  expect(fix.time.observed).toBe('2026-10-10T11:12:00.000Z');
  expect(fix.outcome).toMatchObject({
    status: 'collected',
    value: { speedMps: 0, headingDegrees: null },
  });
  const weather = records.find((item) => item.subject === 'weather')!;
  expect(weather.time.observed).toBe('2026-10-10T11:00:00.000Z');
  expect(weather.outcome).toMatchObject({
    status: 'collected',
    quality: { estimated: true },
    value: { temperatureC: 12 },
  });
  expect(records.find((item) => item.subject === 'power')?.outcome).toMatchObject({
    status: 'collected',
    value: { chargingSeconds: null },
  });
  expect(() => canonical(records)).not.toThrow();
});

test('disabled location prevents all service position requests and records unavailable dependencies', async () => {
  const position = vi.fn();
  Object.defineProperty(navigator, 'geolocation', {
    configurable: true,
    value: { getCurrentPosition: position },
  });
  const fetchFn = vi.fn<typeof fetch>();
  const records = await all(
    collectObservations(
      browserObservationCollectors({
        installation: 'fixture',
        app: { feature: 'agent', entry: 'direct' },
        enabled: { location: false },
        fetch: fetchFn,
      }),
    ),
  );
  expect(position).not.toHaveBeenCalled();
  expect(fetchFn).not.toHaveBeenCalled();
  expect(records.find((item) => item.subject === 'location')?.outcome.status).toBe('disabled');
  expect(records.find((item) => item.subject === 'weather')?.outcome).toEqual({
    status: 'unavailable',
    reason: { code: 'locationRequired' },
  });
});
