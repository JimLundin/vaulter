// What the browser can say about an exchange on its own, for its capture (app/vault/documents/notes/capture.ts): the device, the
// connection and battery, where Jim is (one-time permission; matched to the nearest place note, or an address
// from OpenStreetMap), and the weather there (open-meteo.com). Every part is best effort: what the browser
// doesn't offer, or doesn't answer in time, is left out, never guessed.

import { weather } from './weather.ts';

type Group = Record<string, unknown>;

const TIMEOUT_MS = 8000;
const DEVICE_KEY = 'vault.device.id';
/** A place note counts as where Jim is within this many metres (or the fix's accuracy, if worse). */
const NEAR_M = 150;

const within = <T>(p: Promise<T>, ms = TIMEOUT_MS): Promise<T | undefined> =>
  Promise.race([p, new Promise<undefined>((r) => setTimeout(() => r(undefined), ms))]).catch(
    () => undefined,
  );
const round = (n: number | null | undefined, d = 0) =>
  n == null || Number.isNaN(n) ? undefined : Math.round(n * 10 ** d) / 10 ** d;

/** A random id for this browser on this device, kept in localStorage: tells two phones apart without a name. */
export function deviceId(store: Pick<Storage, 'getItem' | 'setItem'> = localStorage) {
  let id = store.getItem(DEVICE_KEY);
  if (!id) {
    id = [...crypto.getRandomValues(new Uint8Array(4))]
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    store.setItem(DEVICE_KEY, id);
  }
  return id;
}

interface UAData {
  mobile?: boolean;
  platform?: string;
  brands?: { brand: string; version: string }[];
  getHighEntropyValues?: (hints: string[]) => Promise<Record<string, unknown>>;
}

/** The browser and OS from the user agent string, where Client Hints are missing (Safari, Firefox). */
export function fromUserAgent(ua: string) {
  const os = /Android/.test(ua)
    ? 'Android'
    : /iPhone|iPad|iPod/.test(ua)
      ? 'iOS'
      : /Windows/.test(ua)
        ? 'Windows'
        : /Mac OS X/.test(ua)
          ? 'macOS'
          : /CrOS/.test(ua)
            ? 'ChromeOS'
            : /Linux/.test(ua)
              ? 'Linux'
              : undefined;
  const osVersion =
    /Android ([\d.]+)/.exec(ua)?.[1] ??
    /OS ([\d_]+) like Mac/.exec(ua)?.[1]?.replace(/_/g, '.') ??
    /Mac OS X ([\d_.]+)/.exec(ua)?.[1]?.replace(/_/g, '.');
  const browser =
    /Edg\/([\d]+)/.exec(ua)?.[1] != null
      ? `Edge ${/Edg\/([\d]+)/.exec(ua)![1]}`
      : /Firefox\/([\d]+)/.exec(ua)
        ? `Firefox ${/Firefox\/([\d]+)/.exec(ua)![1]}`
        : /(?:Chrome|CriOS)\/([\d]+)/.exec(ua)
          ? `Chrome ${/(?:Chrome|CriOS)\/([\d]+)/.exec(ua)![1]}`
          : /Version\/([\d.]+).*Safari/.exec(ua)
            ? `Safari ${/Version\/([\d.]+).*Safari/.exec(ua)![1]}`
            : undefined;
  return { os, os_version: osVersion, browser };
}

/** The device: id, form (phone, tablet, desktop), OS, model, browser, whether the app is installed, screen. */
export async function device(): Promise<Group> {
  const nav = navigator as Navigator & { userAgentData?: UAData; deviceMemory?: number };
  const ua = fromUserAgent(nav.userAgent);
  const hints = await within(
    nav.userAgentData?.getHighEntropyValues?.([
      'model',
      'platformVersion',
      'architecture',
      'bitness',
      'fullVersionList',
      'formFactors',
    ]) ?? Promise.resolve(undefined),
    2000,
  );
  const touch = nav.maxTouchPoints > 0;
  const short = Math.min(screen.width, screen.height);
  const form = /Tablet/.test(String(hints?.formFactors))
    ? 'tablet'
    : (nav.userAgentData?.mobile ?? /Mobi/.test(nav.userAgent))
      ? 'phone'
      : touch && short >= 600 && /Android|iOS/.test(String(ua.os))
        ? 'tablet'
        : 'desktop';
  const brand = (hints?.fullVersionList as UAData['brands'])?.find(
    (b) => !/Not.?A.?Brand|Chromium/i.test(b.brand),
  );
  return {
    id: deviceId(),
    form,
    os: nav.userAgentData?.platform || ua.os,
    os_version: hints?.platformVersion || ua.os_version,
    model: hints?.model || undefined,
    arch: hints?.architecture
      ? `${hints.architecture}${hints.bitness ? `-${hints.bitness}` : ''}`
      : undefined,
    browser: brand ? `${brand.brand} ${brand.version.split('.')[0]}` : ua.browser,
    installed: matchMedia('(display-mode: standalone)').matches || undefined,
    screen: `${screen.width}x${screen.height}@${round(devicePixelRatio, 2)}`,
    touch,
    cores: nav.hardwareConcurrency || undefined,
    memory_gb: nav.deviceMemory,
    locale: nav.language,
    languages: nav.languages?.length > 1 ? [...nav.languages] : undefined,
    tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
  };
}

/** The moment's context: online, connection, battery, theme, orientation, whether the page is in view. */
export async function context(): Promise<Group> {
  const nav = navigator as Navigator & {
    connection?: {
      type?: string;
      effectiveType?: string;
      downlink?: number;
      rtt?: number;
      saveData?: boolean;
    };
    getBattery?: () => Promise<{ level: number; charging: boolean }>;
  };
  const c = nav.connection;
  const battery = await within(nav.getBattery?.() ?? Promise.resolve(undefined), 2000);
  return {
    online: nav.onLine,
    network: c?.type,
    network_speed: c?.effectiveType,
    downlink_mbps: c?.downlink,
    rtt_ms: c?.rtt,
    save_data: c?.saveData || undefined,
    battery: round(battery?.level, 2),
    charging: battery?.charging,
    theme: matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
    orientation: screen.orientation?.type?.split('-')[0],
  };
}

/** A place note with coordinates, for matching a fix to where Jim is. */
export interface Place {
  id: string;
  lat: number;
  lon: number;
}

/** Metres between two points (haversine). */
export function distanceM(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const r = (d: number) => (d * Math.PI) / 180;
  const h =
    Math.sin(r(b.lat - a.lat) / 2) ** 2 +
    Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lon - a.lon) / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h));
}

/** The nearest place note within reach of a fix, with its distance, or null. Cities and regions have one
 * point for a large area, so only the nearest counts, and only within NEAR_M or the fix's accuracy. */
export function nearestPlace(
  fix: { lat: number; lon: number; accuracy?: number },
  places: Place[],
) {
  let best: { id: string; m: number } | null = null;
  for (const p of places) {
    const m = distanceM(fix, p);
    if (!best || m < best.m) best = { id: p.id, m };
  }
  return best && best.m <= Math.max(NEAR_M, fix.accuracy ?? 0) ? best : null;
}

const position = () =>
  new Promise<GeolocationPosition>((ok, no) =>
    navigator.geolocation.getCurrentPosition(ok, no, {
      enableHighAccuracy: true,
      timeout: TIMEOUT_MS,
      maximumAge: 5 * 60_000,
    }),
  );

/** Where Jim is: the fix (rounded to ~11 m), the place note it is at, else an address from OpenStreetMap. */
export async function location(
  places: Place[],
  fetchFn: typeof fetch = (...a) => fetch(...a),
): Promise<{ location?: Group; where?: string[] }> {
  if (!('geolocation' in navigator)) return {};
  const state = await within(
    navigator.permissions?.query({ name: 'geolocation' }).then((s) => s.state) ??
      Promise.resolve(undefined),
    2000,
  );
  if (state === 'denied') return {};
  const pos = await within(position(), TIMEOUT_MS + 1000);
  if (!pos) return {};
  const { latitude: lat, longitude: lon, accuracy, altitude, speed, heading } = pos.coords;
  const near = nearestPlace({ lat, lon, accuracy }, places);
  const address = near
    ? undefined
    : await within(
        fetchFn(
          `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=jsonv2&zoom=18`,
        )
          .then((r) => (r.ok ? r.json() : null))
          .then((j) => shortAddress(j?.address)),
      );
  return {
    location: {
      lat: round(lat, 4),
      lon: round(lon, 4),
      accuracy_m: round(accuracy),
      altitude_m: round(altitude),
      speed_kmh: speed ? round(speed * 3.6) : undefined,
      heading: speed ? round(heading) : undefined,
      distance_m: near ? round(near.m) : undefined,
      address,
    },
    where: near ? [near.id] : undefined,
  };
}

/** "Kungsgatan 12, Uppsala" from Nominatim's address parts. */
export function shortAddress(a: Partial<Record<string, string>> | undefined) {
  if (!a) return;
  const street = [a.road ?? a.pedestrian ?? a.footway, a.house_number].filter(Boolean).join(' ');
  const town = a.city ?? a.town ?? a.village ?? a.municipality;
  return (
    [a.amenity ?? a.shop ?? a.building, street, a.suburb, town].filter(Boolean).join(', ') ||
    undefined
  );
}

declare const __COMMIT__: string;
/** The commit the running app was built from (the deploy's GITHUB_SHA), or undefined in dev. */
export const appVersion = () => (typeof __COMMIT__ === 'string' && __COMMIT__) || undefined;

/** Everything the browser can collect for an exchange, at once: the groups, and the place note Jim is at. */
export async function collect(places: Place[]) {
  const [d, c, l] = await Promise.all([device(), context(), location(places)]);
  const loc = l.location as { lat?: number; lon?: number } | undefined;
  const w =
    loc?.lat != null && loc.lon != null
      ? await weather(loc.lat, loc.lon, (...a) => fetch(...a))
      : undefined;
  return { groups: { device: d, context: c, location: l.location, weather: w }, where: l.where };
}
