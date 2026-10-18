import { parseObservation } from '@/modules/observations/index.ts';

/** Fictional measurement context does not assert the user's presence at these coordinates. */
export const fictionalWeatherObservation = parseObservation({
  subject: 'weather',
  source: { kind: 'application', name: 'Fictional weather collector' },
  time: { requested: null, observed: '2026-10-04T22:05:00+02:00', received: null, elapsedMs: null },
  outcome: {
    status: 'collected',
    value: {
      latitude: 59.3,
      longitude: 18.1,
      intervalSeconds: null,
      temperatureC: 11.4,
      apparentTemperatureC: 8.2,
      humidityPercent: 71,
      precipitationMm: 0,
      cloudPercent: 67,
      windMps: 4.4,
      daylight: false,
      raw: { temp_c: 11.4, conditions: 'partly cloudy' },
    },
    quality: { method: 'coordinates of the place page' },
  },
});
