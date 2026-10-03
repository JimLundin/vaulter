import { expect, test } from 'vitest';
import { deviceId, distanceM, fromUserAgent, nearestPlace, shortAddress } from './meta.ts';
import { weather } from '../../../core/weather.ts';

test('the user agent string, where Client Hints are missing', () => {
  expect(
    fromUserAgent(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 26_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.1 Mobile/15E148 Safari/604.1',
    ),
  ).toEqual({ os: 'iOS', os_version: '26.1', browser: 'Safari 26.1' });
  expect(
    fromUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:143.0) Gecko/20100101 Firefox/143.0',
    ),
  ).toEqual({ os: 'Windows', os_version: undefined, browser: 'Firefox 143' });
  expect(
    fromUserAgent(
      'Mozilla/5.0 (Linux; Android 16; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36',
    ).os_version,
  ).toBe('16');
});

test('a device id is made once and kept', () => {
  const m = new Map<string, string>();
  const store = {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => {
      m.set(k, v);
    },
  };
  const id = deviceId(store);
  expect(id).toMatch(/^[0-9a-f]{8}$/);
  expect(deviceId(store)).toBe(id);
});

test('the nearest place note counts only when it is close (or the fix is that rough)', () => {
  const places = [
    { id: 'Uppsala Apartment', lat: 59.8451, lon: 17.6161 },
    { id: 'Uppsala', lat: 59.8586, lon: 17.6389 },
  ];
  expect(Math.round(distanceM(places[0], places[1]))).toBe(1968);
  expect(nearestPlace({ lat: 59.8452, lon: 17.6163, accuracy: 10 }, places)).toMatchObject({
    id: 'Uppsala Apartment',
  });
  expect(nearestPlace({ lat: 59.851, lon: 17.627, accuracy: 20 }, places)).toBeNull();
  expect(nearestPlace({ lat: 59.851, lon: 17.627, accuracy: 1200 }, places)).toMatchObject({
    id: 'Uppsala Apartment',
  });
});

test('an address from Nominatim, short', () => {
  expect(
    shortAddress({ road: 'Kungsgatan', house_number: '12', suburb: 'Centrum', city: 'Uppsala' }),
  ).toBe('Kungsgatan 12, Centrum, Uppsala');
  expect(shortAddress(undefined)).toBeUndefined();
});

test('the weather from open-meteo, in words', async () => {
  const fetchFn = (() =>
    Promise.resolve(
      Response.json({
        current: {
          temperature_2m: 9.44,
          apparent_temperature: 6.1,
          relative_humidity_2m: 88,
          precipitation: 0.4,
          weather_code: 61,
          cloud_cover: 100,
          wind_speed_10m: 4.12,
          is_day: 1,
        },
      }),
    )) as unknown as typeof fetch;
  expect(await weather(59.8, 17.6, fetchFn)).toEqual({
    temp_c: 9.4,
    feels_like_c: 6.1,
    humidity: 88,
    precipitation_mm: 0.4,
    conditions: 'light rain',
    cloud_cover: 100,
    wind_ms: 4.1,
    daylight: true,
  });
});
