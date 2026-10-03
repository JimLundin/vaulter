// The weather now at a point, from open-meteo.com (free, no key, any origin): for a capture's exchange, from
// the app (where Jim is) and tools/capture.ts (the place he names). Best effort: null when it doesn't answer.

const round = (n: number | null | undefined, d = 0) =>
  n == null || Number.isNaN(n) ? undefined : Math.round(n * 10 ** d) / 10 ** d;

/** WMO weather codes, as open-meteo reports them. */
const WMO: Record<number, string> = {
  0: 'clear',
  1: 'mostly clear',
  2: 'partly cloudy',
  3: 'overcast',
  45: 'fog',
  48: 'rime fog',
  51: 'light drizzle',
  53: 'drizzle',
  55: 'heavy drizzle',
  56: 'freezing drizzle',
  57: 'freezing drizzle',
  61: 'light rain',
  63: 'rain',
  65: 'heavy rain',
  66: 'freezing rain',
  67: 'freezing rain',
  71: 'light snow',
  73: 'snow',
  75: 'heavy snow',
  77: 'snow grains',
  80: 'light showers',
  81: 'showers',
  82: 'heavy showers',
  85: 'snow showers',
  86: 'heavy snow showers',
  95: 'thunderstorm',
  96: 'thunderstorm with hail',
  99: 'thunderstorm with hail',
};

/** The weather now at a point (open-meteo.com: free, no key). */
export async function weather(
  lat: number,
  lon: number,
  fetchFn: typeof fetch,
  timeoutMs = 8000,
): Promise<Record<string, unknown> | undefined> {
  const q = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    current:
      'temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,weather_code,cloud_cover,wind_speed_10m,is_day',
    wind_speed_unit: 'ms',
    timezone: 'Europe/Stockholm',
  });
  const j = await Promise.race([
    fetchFn(`https://api.open-meteo.com/v1/forecast?${q}`)
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null),
    new Promise<null>((r) => setTimeout(() => r(null), timeoutMs)),
  ]);
  const c = j?.current;
  if (!c) return undefined;
  return {
    temp_c: round(c.temperature_2m, 1),
    feels_like_c: round(c.apparent_temperature, 1),
    humidity: round(c.relative_humidity_2m),
    precipitation_mm: round(c.precipitation, 1),
    conditions: WMO[c.weather_code as number],
    cloud_cover: round(c.cloud_cover),
    wind_ms: round(c.wind_speed_10m, 1),
    daylight: c.is_day === 1,
  };
}
