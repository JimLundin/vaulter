// One-shot collectors emit independently as they finish; optional services never gate submission.
import type {
  AppContextData,
  DeviceData,
  LocationData,
  ObservationData,
  ObservationOutcome,
  ObservationSource,
  ObservationSubject,
  ObservationValues,
} from '../../vault/documents/chat-metadata.ts';
import type { JsonObject } from '../../vault/nodes/model.ts';
import { parseMetadata } from '../../vault/documents/chat-metadata-schema.ts';
import { canonical, frozen } from '../../vault/nodes/json.ts';

export interface ObservationCollector {
  readonly subject: ObservationSubject;
  readonly source: ObservationSource;
  readonly enabled: boolean;
  readonly collect: (signal: AbortSignal) => Promise<{
    readonly observed: string | null;
    readonly outcome: ObservationOutcome<ObservationValues[ObservationSubject]>;
  }>;
}

/** Starts all collectors immediately; consume/persist results in completion order. */
export async function* collectObservations(
  collectors: readonly ObservationCollector[],
  options: { readonly timeoutMs?: number; readonly now?: () => Date } = {},
): AsyncGenerator<ObservationData> {
  const timeoutMs = options.timeoutMs ?? 10_000;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error('Invalid collection timeout');
  const now = options.now ?? (() => new Date());
  // Reject invalid descriptors before any collector, timer, or browser permission request starts.
  for (const collector of collectors)
    parseMetadata({
      kind: 'observation',
      subject: collector.subject,
      source: collector.source,
      time: {
        requested: now().toISOString(),
        observed: null,
        received: now().toISOString(),
        elapsedMs: 0,
      },
      outcome: missing('disabled', 'descriptorValidation'),
    });
  const pending = new Map<number, Promise<{ index: number; data: ObservationData }>>();
  const completed: { index: number; data: ObservationData }[] = [];
  const controllers: AbortController[] = [];
  collectors.forEach((collector, index) => {
    const controller = new AbortController();
    controllers.push(controller);
    const requested = now().toISOString();
    const start = performance.now();
    pending.set(
      index,
      new Promise<{ index: number; data: ObservationData }>((resolve) => {
        let settled = false;
        const finish = (result: Awaited<ReturnType<ObservationCollector['collect']>>) => {
          if (settled) return;
          // Subject/value compatibility is guaranteed by the typed collector factory below.
          const data = {
            kind: 'observation',
            subject: collector.subject,
            source: collector.source,
            time: {
              requested,
              observed: result.observed,
              received: now().toISOString(),
              elapsedMs: Math.max(0, performance.now() - start),
            },
            outcome: result.outcome,
          } as ObservationData;
          const checked = parseMetadata(data) as ObservationData;
          settled = true;
          clearTimeout(timer);
          const item = { index, data: frozen(checked) };
          completed.push(item);
          resolve(item);
        };
        const timer = setTimeout(() => {
          finish({ observed: null, outcome: missing('timedOut', 'deadline') });
          controller.abort();
        }, timeoutMs);
        controller.signal.addEventListener(
          'abort',
          () => {
            finish({ observed: null, outcome: missing('unavailable', 'collectionStopped') });
          },
          { once: true },
        );
        if (!collector.enabled) {
          finish({ observed: null, outcome: missing('disabled', 'collectionDisabled') });
          return;
        }
        Promise.resolve()
          .then(() => collector.collect(controller.signal))
          .then((result) => {
            canonical(result);
            finish(result);
          })
          .catch((error: unknown) => {
            finish({
              observed: null,
              outcome: missing('failed', 'collectorFailure', String(error)),
            });
          });
      }),
    );
  });
  try {
    while (pending.size) {
      // biome-ignore lint/performance/noAwaitInLoops: yield observations in completion order.
      if (!completed.length) await Promise.race(pending.values());
      const { index, data } = completed.shift()!;
      pending.delete(index);
      yield data;
    }
  } finally {
    for (const controller of controllers) controller.abort();
  }
}

const missing = (
  status: Exclude<ObservationOutcome<never>['status'], 'collected'>,
  code: string,
  message?: string,
): ObservationOutcome<never> => ({
  status,
  reason: { code, ...(message === undefined ? {} : { message }) },
});
const numberOrNull = (value: number | null | undefined) =>
  value != null && Number.isFinite(value) ? value : null;
const present = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T; // omit unsupported optional browser properties

/** Subject and value remain correlated at the extension seam. */
export function observationCollector<Subject extends ObservationSubject>(options: {
  readonly subject: Subject;
  readonly source: ObservationSource;
  readonly enabled?: boolean;
  readonly collect: (signal: AbortSignal) => Promise<{
    readonly observed: string | null;
    readonly outcome: ObservationOutcome<ObservationValues[Subject]>;
  }>;
}): ObservationCollector {
  return { ...options, enabled: options.enabled ?? true };
}

interface BrowserHints {
  mobile?: boolean;
  platform?: string;
  brands?: { brand: string; version: string }[];
  getHighEntropyValues?: (keys: string[]) => Promise<Record<string, unknown>>;
}
type BrowserNavigator = Navigator & {
  userAgentData?: BrowserHints;
  deviceMemory?: number;
  connection?: {
    type?: string;
    effectiveType?: string;
    downlink?: number;
    rtt?: number;
    saveData?: boolean;
  };
  getBattery?: () => Promise<{
    level: number;
    charging: boolean;
    chargingTime: number;
    dischargingTime: number;
  }>;
};

export interface BrowserObservationOptions {
  readonly installation: string;
  readonly app: Pick<AppContextData, 'feature' | 'entry' | 'build'>;
  /** These settings control future collection only. */
  readonly enabled?: Partial<Readonly<Record<ObservationSubject, boolean>>>;
  readonly fetch?: typeof fetch;
}

/** Rich browser/service collection, with no background tracking or required third-party response. */
export function browserObservationCollectors(
  options: BrowserObservationOptions,
): ObservationCollector[] {
  const nav: BrowserNavigator = navigator;
  const fetchFn = options.fetch ?? fetch;
  const enabled = (subject: ObservationSubject) => options.enabled?.[subject] ?? true;
  const browserSource: ObservationSource = {
    kind: 'browser',
    name: 'webPlatform',
    version: '1',
  };
  const at = () => new Date().toISOString();
  const browser = <Subject extends ObservationSubject>(
    subject: Subject,
    read: () => ObservationValues[Subject] | Promise<ObservationValues[Subject]>,
  ) =>
    observationCollector({
      subject,
      source: browserSource,
      enabled: enabled(subject),
      collect: async () => {
        const value = await read();
        return { observed: at(), outcome: { status: 'collected', value: present(value) } };
      },
    });
  const collectors: ObservationCollector[] = [
    browser('clock', () => {
      const now = new Date();
      return {
        instant: now.toISOString(),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        offsetMinutes: -now.getTimezoneOffset(),
        locale: nav.language,
      };
    }),
    browser('app', () => ({
      ...options.app,
      visibility: document.visibilityState === 'visible' ? 'visible' : 'hidden',
      focused: document.hasFocus(),
    })),
    browser('device', async (): Promise<DeviceData> => {
      const hints = await nav.userAgentData
        ?.getHighEntropyValues?.([
          'model',
          'platformVersion',
          'architecture',
          'bitness',
          'fullVersionList',
        ])
        .catch(() => undefined);
      const hint = (key: string) => (typeof hints?.[key] === 'string' ? hints[key] : undefined);
      const brands = hints?.fullVersionList ?? nav.userAgentData?.brands;
      return {
        installation: options.installation,
        userAgent: nav.userAgent,
        platform: nav.userAgentData?.platform ?? nav.platform,
        platformVersion: hint('platformVersion'),
        model: hint('model'),
        architecture: hint('architecture'),
        bitness: hint('bitness'),
        mobile: nav.userAgentData?.mobile,
        browsers: Array.isArray(brands)
          ? brands.flatMap((brand: unknown) => {
              if (
                brand &&
                typeof brand === 'object' &&
                'brand' in brand &&
                'version' in brand &&
                typeof brand.brand === 'string' &&
                typeof brand.version === 'string'
              )
                return [{ name: brand.brand, version: brand.version }];
              return [];
            })
          : undefined,
        languages: [...nav.languages],
        cores: nav.hardwareConcurrency || undefined,
        memoryGb: nav.deviceMemory,
        touchPoints: nav.maxTouchPoints,
        capabilities: {
          geolocation: !!nav.geolocation,
          battery: !!nav.getBattery,
          connection: !!nav.connection,
          media: !!nav.mediaDevices,
        },
      };
    }),
    browser('display', () => ({
      screen: { width: screen.width, height: screen.height, colorDepth: screen.colorDepth },
      viewport: {
        width: window.visualViewport?.width ?? window.innerWidth,
        height: window.visualViewport?.height ?? window.innerHeight,
        scale: window.visualViewport?.scale,
      },
      pixelRatio: window.devicePixelRatio,
      orientation: screen.orientation?.type,
      mode: matchMedia('(display-mode: standalone)').matches
        ? 'standalone'
        : matchMedia('(display-mode: fullscreen)').matches
          ? 'fullscreen'
          : matchMedia('(display-mode: minimal-ui)').matches
            ? 'minimal-ui'
            : 'browser',
      systemTheme: matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
      reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
      contrast: matchMedia('(prefers-contrast: more)').matches
        ? 'more'
        : matchMedia('(prefers-contrast: less)').matches
          ? 'less'
          : 'none',
    })),
    browser('connectivity', () => ({
      online: nav.onLine,
      type: nav.connection?.type,
      effectiveType: nav.connection?.effectiveType,
      downlinkMbps: nav.connection?.downlink,
      rttMs: nav.connection?.rtt,
      saveData: nav.connection?.saveData,
    })),
    observationCollector({
      subject: 'power',
      source: browserSource,
      enabled: enabled('power'),
      collect: async () => {
        if (!nav.getBattery)
          return { observed: null, outcome: missing('unsupported', 'batteryApi') };
        const battery = await nav.getBattery();
        return {
          observed: at(),
          outcome: {
            status: 'collected',
            value: {
              level: battery.level,
              charging: battery.charging,
              chargingSeconds: numberOrNull(battery.chargingTime),
              dischargingSeconds: numberOrNull(battery.dischargingTime),
            },
          },
        };
      },
    }),
  ];
  // One fix shared by location-derived services. No service silently requests its own position.
  let sharedFix: Promise<Awaited<ReturnType<typeof locate>>> | undefined;
  const locate = () =>
    new Promise<{ observed: string | null; outcome: ObservationOutcome<LocationData> }>(
      (resolve) => {
        if (!enabled('location'))
          return resolve({ observed: null, outcome: missing('disabled', 'locationDisabled') });
        if (!nav.geolocation)
          return resolve({ observed: null, outcome: missing('unsupported', 'geolocationApi') });
        nav.geolocation.getCurrentPosition(
          (fix) => {
            const c = fix.coords;
            resolve({
              observed: new Date(fix.timestamp).toISOString(),
              outcome: {
                status: 'collected',
                value: {
                  latitude: c.latitude,
                  longitude: c.longitude,
                  accuracyM: c.accuracy,
                  altitudeM: numberOrNull(c.altitude),
                  altitudeAccuracyM: numberOrNull(c.altitudeAccuracy),
                  speedMps: numberOrNull(c.speed),
                  headingDegrees: numberOrNull(c.heading),
                },
              },
            });
          },
          (error) =>
            resolve({
              observed: null,
              outcome: missing(
                error.code === 1 ? 'denied' : error.code === 3 ? 'timedOut' : 'unavailable',
                error.code === 1
                  ? 'geolocationPermission'
                  : error.code === 3
                    ? 'geolocationDeadline'
                    : 'geolocationUnavailable',
              ),
            }),
          { enableHighAccuracy: true, timeout: 8000, maximumAge: 300_000 },
        );
      },
    );
  const position = () => {
    sharedFix ??= locate();
    return sharedFix;
  };
  collectors.push(
    observationCollector({
      subject: 'location',
      source: { ...browserSource, method: 'geolocation' },
      enabled: enabled('location'),
      collect: position,
    }),
  );
  const service = <Subject extends 'address' | 'weather' | 'airQuality'>(
    subject: Subject,
    name: string,
    read: (
      location: LocationData,
      signal: AbortSignal,
    ) => Promise<{
      observed: string | null;
      value: ObservationValues[Subject];
    }>,
  ) =>
    observationCollector({
      subject,
      source: { kind: 'service', name, version: '1' },
      enabled: enabled(subject),
      collect: async (signal) => {
        const location = await position();
        signal.throwIfAborted();
        if (location.outcome.status !== 'collected')
          return {
            observed: null,
            outcome: missing('unavailable', 'locationRequired'),
          };
        const result = await read(location.outcome.value, signal);
        return {
          observed: result.observed,
          outcome: {
            status: 'collected',
            value: result.value,
            quality: {
              estimated: subject !== 'address',
              method: subject === 'address' ? 'reverseGeocoding' : 'providerGrid',
            },
          },
        };
      },
    });
  const json = async (url: string, signal: AbortSignal): Promise<JsonObject> => {
    const response = await fetchFn(url, { signal });
    if (!response.ok) throw new Error(`Provider HTTP ${response.status}`);
    const value: unknown = await response.json();
    canonical(value);
    if (!value || typeof value !== 'object' || Array.isArray(value))
      throw new Error('Invalid provider object');
    return value as JsonObject;
  };
  collectors.push(
    service('address', 'nominatim', async (location, signal) => {
      const query = new URLSearchParams({
        lat: String(location.latitude),
        lon: String(location.longitude),
        format: 'jsonv2',
      });
      const raw = await json(`https://nominatim.openstreetmap.org/reverse?${query}`, signal);
      if (typeof raw.display_name !== 'string')
        throw new Error('Invalid reverse-geocoding response');
      const parts = raw.address;
      return {
        observed: null,
        value: {
          label: raw.display_name,
          raw,
          latitude: location.latitude,
          longitude: location.longitude,
          parts:
            parts && typeof parts === 'object' && !Array.isArray(parts)
              ? Object.fromEntries(
                  Object.entries(parts).filter(
                    (entry): entry is [string, string] => typeof entry[1] === 'string',
                  ),
                )
              : {},
        },
      };
    }),
  );
  const environment = async (location: LocationData, signal: AbortSignal, air: boolean) => {
    const fields = air
      ? 'european_aqi,pm2_5,pm10,carbon_monoxide,nitrogen_dioxide,ozone,sulphur_dioxide,uv_index'
      : 'temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,rain,snowfall,weather_code,cloud_cover,wind_speed_10m,wind_direction_10m,wind_gusts_10m,surface_pressure,is_day';
    const query = new URLSearchParams({
      latitude: String(location.latitude),
      longitude: String(location.longitude),
      current: fields,
      timezone: 'UTC',
      timeformat: 'unixtime',
    });
    if (!air) query.set('wind_speed_unit', 'ms');
    const raw = await json(
      `https://${air ? 'air-quality-api' : 'api'}.open-meteo.com/v1/${air ? 'air-quality' : 'forecast'}?${query}`,
      signal,
    );
    const { current } = raw;
    if (!current || typeof current !== 'object' || Array.isArray(current))
      throw new Error('Invalid environment response');
    const measurements = current as JsonObject;
    const number = (key: string) =>
      typeof measurements[key] === 'number' && Number.isFinite(measurements[key])
        ? measurements[key]
        : undefined;
    const time = number('time');
    const interval = number('interval');
    if (time === undefined || interval === undefined)
      throw new Error('Missing environment observation time');
    return {
      raw,
      number,
      observed: new Date(time * 1000).toISOString(),
      intervalSeconds: interval,
    };
  };
  collectors.push(
    service('weather', 'openMeteo', async (location, signal) => {
      const { raw, number, observed, intervalSeconds } = await environment(location, signal, false);
      return {
        observed,
        value: present({
          latitude: location.latitude,
          longitude: location.longitude,
          intervalSeconds,
          raw,
          temperatureC: number('temperature_2m'),
          apparentTemperatureC: number('apparent_temperature'),
          humidityPercent: number('relative_humidity_2m'),
          precipitationMm: number('precipitation'),
          rainMm: number('rain'),
          snowfallCm: number('snowfall'),
          code: number('weather_code'),
          cloudPercent: number('cloud_cover'),
          windMps: number('wind_speed_10m'),
          windDirectionDegrees: number('wind_direction_10m'),
          gustMps: number('wind_gusts_10m'),
          pressureHpa: number('surface_pressure'),
          daylight: number('is_day') === undefined ? undefined : number('is_day') === 1,
        }),
      };
    }),
  );
  collectors.push(
    service('airQuality', 'openMeteo', async (location, signal) => {
      const { raw, number, observed, intervalSeconds } = await environment(location, signal, true);
      return {
        observed,
        value: present({
          latitude: location.latitude,
          longitude: location.longitude,
          intervalSeconds,
          raw,
          europeanIndex: number('european_aqi'),
          pm25MicrogramsM3: number('pm2_5'),
          pm10MicrogramsM3: number('pm10'),
          carbonMonoxideMicrogramsM3: number('carbon_monoxide'),
          nitrogenDioxideMicrogramsM3: number('nitrogen_dioxide'),
          ozoneMicrogramsM3: number('ozone'),
          sulphurDioxideMicrogramsM3: number('sulphur_dioxide'),
          uvIndex: number('uv_index'),
        }),
      };
    }),
  );
  return collectors;
}
