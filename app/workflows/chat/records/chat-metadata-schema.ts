// Feature ingress validates metadata semantics before crossing the generic JSON store seam.
import { z } from 'zod';
import { canonical, frozen } from '../../../vault/nodes/json.ts';
import { jsonObject, jsonRecord } from '../../../vault/nodes/json-schema.ts';
import type { MetadataData, MetadataReferenceData } from './chat-metadata.ts';

const text = z.string().min(1);
const instant = z.iso.datetime({ offset: true });
const finite = z.number().finite();
const nonnegative = finite.nonnegative();
const count = nonnegative.int();
const json = jsonObject;
const jsonValue = z.custom<import('../../../vault/nodes/model.ts').JsonValue>((value) => {
  try {
    canonical(value);
    return true;
  } catch {
    return false;
  }
}, 'Invalid JSON');
const source = z.object({
  kind: z.enum(['application', 'browser', 'service', 'user', 'agent']),
  name: text,
  version: text.optional(),
  method: text.optional(),
  request: text.optional(),
});
const time = z.object({
  requested: instant,
  observed: instant.nullable(),
  received: instant,
  elapsedMs: nonnegative,
});
const quality = z.object({
  method: text.optional(),
  estimated: z.boolean().optional(),
  details: json.optional(),
});
const selection = z
  .strictObject({ format: z.literal('text'), start: count, end: count, unit: z.literal('utf16') })
  .refine((value) => value.end >= value.start, 'Selection ends before it starts');
const error = z.object({ code: text, message: text });
const model = z.object({ requested: text, served: text.optional() });
const values = {
  clock: z.object({
    instant,
    timezone: text,
    offsetMinutes: finite.int().min(-840).max(840),
    locale: text,
  }),
  app: z.object({
    build: text.optional(),
    feature: text,
    entry: z.enum(['direct', 'suggestion', 'notification', 'share', 'import']),
    visibility: z.enum(['visible', 'hidden']),
    focused: z.boolean(),
  }),
  device: z.object({
    installation: text,
    userAgent: z.string(),
    platform: z.string().optional(),
    platformVersion: z.string().optional(),
    model: z.string().optional(),
    architecture: z.string().optional(),
    bitness: z.string().optional(),
    mobile: z.boolean().optional(),
    browsers: z.array(z.object({ name: text, version: text })).optional(),
    languages: z.array(text),
    cores: count.optional(),
    memoryGb: nonnegative.optional(),
    touchPoints: count,
    capabilities: z.object({
      geolocation: z.boolean(),
      battery: z.boolean(),
      connection: z.boolean(),
      media: z.boolean(),
    }),
  }),
  display: z.object({
    screen: z.object({ width: nonnegative, height: nonnegative, colorDepth: count }),
    viewport: z.object({
      width: nonnegative,
      height: nonnegative,
      scale: finite.positive().optional(),
    }),
    pixelRatio: finite.positive(),
    orientation: text.optional(),
    mode: z.enum(['browser', 'standalone', 'fullscreen', 'minimal-ui']),
    systemTheme: z.enum(['light', 'dark']),
    reducedMotion: z.boolean(),
    contrast: z.enum(['more', 'less', 'none']),
  }),
  connectivity: z.object({
    online: z.boolean(),
    type: text.optional(),
    effectiveType: text.optional(),
    downlinkMbps: nonnegative.optional(),
    rttMs: nonnegative.optional(),
    saveData: z.boolean().optional(),
  }),
  power: z.object({
    level: finite.min(0).max(1),
    charging: z.boolean(),
    chargingSeconds: nonnegative.nullable(),
    dischargingSeconds: nonnegative.nullable(),
  }),
  location: z.object({
    latitude: finite.min(-90).max(90),
    longitude: finite.min(-180).max(180),
    accuracyM: nonnegative,
    altitudeM: finite.nullable(),
    altitudeAccuracyM: nonnegative.nullable(),
    speedMps: nonnegative.nullable(),
    headingDegrees: finite.min(0).max(360).nullable(),
  }),
  address: z.object({
    label: text,
    parts: jsonRecord(z.string(), z.string()),
    latitude: finite.min(-90).max(90),
    longitude: finite.min(-180).max(180),
    raw: json,
  }),
  weather: z.object({
    latitude: finite.min(-90).max(90),
    longitude: finite.min(-180).max(180),
    intervalSeconds: nonnegative,
    temperatureC: finite.optional(),
    apparentTemperatureC: finite.optional(),
    humidityPercent: finite.min(0).max(100).optional(),
    precipitationMm: nonnegative.optional(),
    rainMm: nonnegative.optional(),
    snowfallCm: nonnegative.optional(),
    code: count.optional(),
    cloudPercent: finite.min(0).max(100).optional(),
    windMps: nonnegative.optional(),
    windDirectionDegrees: finite.min(0).max(360).optional(),
    gustMps: nonnegative.optional(),
    pressureHpa: nonnegative.optional(),
    daylight: z.boolean().optional(),
    raw: json,
  }),
  airQuality: z.object({
    latitude: finite.min(-90).max(90),
    longitude: finite.min(-180).max(180),
    intervalSeconds: nonnegative,
    europeanIndex: nonnegative.optional(),
    pm25MicrogramsM3: nonnegative.optional(),
    pm10MicrogramsM3: nonnegative.optional(),
    carbonMonoxideMicrogramsM3: nonnegative.optional(),
    nitrogenDioxideMicrogramsM3: nonnegative.optional(),
    ozoneMicrogramsM3: nonnegative.optional(),
    sulphurDioxideMicrogramsM3: nonnegative.optional(),
    uvIndex: nonnegative.optional(),
    raw: json,
  }),
};
const missing = z.object({
  status: z.enum(['disabled', 'unsupported', 'denied', 'unavailable', 'timedOut', 'failed']),
  reason: z.object({ code: text, message: z.string().optional() }),
});
const observation = z
  .union(
    Object.entries(values).map(([subject, value]) =>
      z.object({
        kind: z.literal('observation'),
        subject: z.literal(subject),
        source,
        time,
        outcome: z.union([
          z.object({ status: z.literal('collected'), value, quality: quality.optional() }),
          missing,
        ]),
      }),
    ),
  )
  .superRefine((value, ctx) => {
    if (
      value.outcome.status === 'collected' &&
      value.subject !== 'address' &&
      value.time.observed === null
    )
      ctx.addIssue({
        code: 'custom',
        message: 'A collected measurement requires its observation time',
      });
  });
const attachment = z.object({
  kind: z.literal('attachment'),
  name: text,
  mediaType: text,
  bytes: count,
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  dimensions: z.object({ width: count, height: count }).optional(),
  durationMs: nonnegative.optional(),
  embedded: json.optional(),
});
const input = z.object({
  kind: z.literal('contextInput'),
  role: z.enum(['system', 'user', 'assistant', 'tool']),
  position: count,
  transformation: z.enum(['verbatim', 'selection', 'summary', 'truncation', 'generated']),
  content: z.union([z.string(), json]),
  selection: selection.optional(),
});
const run = z.object({
  kind: z.literal('agentRun'),
  started: instant,
  ended: instant.optional(),
  status: z.enum(['running', 'complete', 'stopped', 'failed', 'interrupted']),
  provider: text,
  model,
  settings: json,
  enabledTools: z.array(z.object({ name: text, version: text.optional() })),
  request: text.optional(),
  finishReason: text.optional(),
  timing: z
    .strictObject({ elapsedMs: nonnegative, firstOutputMs: nonnegative.optional() })
    .optional(),
  usage: z
    .strictObject({
      input: count,
      output: count,
      cachedInput: count.optional(),
      reasoning: count.optional(),
      raw: json.optional(),
    })
    .optional(),
  cost: z
    .strictObject({
      amount: nonnegative,
      currency: text,
      estimated: z.boolean(),
      pricing: z.object({ source: text, at: instant, rates: json }),
    })
    .optional(),
  error: error.optional(),
});
const tool = z.object({
  kind: z.literal('toolExecution'),
  call: text,
  name: text,
  version: text.optional(),
  attempt: count.min(1),
  started: instant,
  ended: instant.optional(),
  elapsedMs: nonnegative.optional(),
  status: z.enum(['running', 'complete', 'failed', 'cancelled']),
  input: jsonValue,
  output: jsonValue.optional(),
  error: error.optional(),
});
const interpretation = z.object({
  kind: z.literal('interpretation'),
  category: z.enum(['summary', 'topic', 'entity', 'event', 'decision', 'intention', 'ambiguity']),
  at: instant,
  statement: text,
  details: json.optional(),
  certainty: z.enum(['explicit', 'inferred', 'uncertain']),
  method: z.object({ name: text, version: text.optional() }),
});
const metadata = z.union([observation, attachment, input, run, tool, interpretation]);
const reference = z.object({
  kind: z.literal('metadataReference'),
  role: z.enum([
    'subject',
    'onScreen',
    'collector',
    'device',
    'agent',
    'configuration',
    'suppliedContext',
    'input',
    'output',
    'evidence',
    'corrects',
    'derivedFrom',
    'place',
    'result',
    'approval',
  ]),
  selection: selection.optional(),
  details: json.optional(),
});

export function parseMetadata(value: unknown): MetadataData {
  canonical(value);
  // Narrowing the runtime union retains the extensible subject/value correlation in TypeScript.
  metadata.parse(value);
  return frozen(structuredClone(value)) as MetadataData;
}
export function parseMetadataReference(value: unknown): MetadataReferenceData {
  canonical(value);
  reference.parse(value);
  return frozen(structuredClone(value)) as MetadataReferenceData;
}
