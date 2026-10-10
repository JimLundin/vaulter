// Feature payloads for permanent observations and agent provenance; references stay structural.
import type { JsonObject } from '../../../vault/nodes/model.ts';

/** Browser wall clock describes instants; monotonic durations are milliseconds. */
// biome-ignore lint/style/useConsistentTypeDefinitions: type aliases satisfy JsonObject structurally
export type ObservationTime = {
  readonly requested: string;
  /** Time the value describes, including the actual time of a cached location fix. */
  readonly observed: string | null;
  readonly received: string;
  readonly elapsedMs: number;
};

// biome-ignore lint/style/useConsistentTypeDefinitions: type aliases satisfy JsonObject structurally
export type ObservationSource = {
  readonly kind: 'application' | 'browser' | 'service' | 'user' | 'agent';
  readonly name: string;
  readonly version?: string;
  readonly method?: string;
  readonly request?: string;
};

// biome-ignore lint/style/useConsistentTypeDefinitions: type aliases satisfy JsonObject structurally
export type ObservationQuality = {
  readonly method?: string;
  readonly estimated?: boolean;
  readonly details?: JsonObject;
};

// Type aliases retain compatibility with the base model's nested JSON objects.
// biome-ignore lint/style/useConsistentTypeDefinitions: type aliases satisfy JsonObject structurally
export type ClockData = {
  readonly instant: string;
  readonly timezone: string;
  /** Minutes east of UTC at instant, independent of a later daylight-saving change. */
  readonly offsetMinutes: number;
  readonly locale: string;
};
// biome-ignore lint/style/useConsistentTypeDefinitions: type aliases satisfy JsonObject structurally
export type AppContextData = {
  readonly build?: string;
  readonly feature: string;
  readonly entry: 'direct' | 'suggestion' | 'notification' | 'share' | 'import';
  readonly visibility: 'visible' | 'hidden';
  readonly focused: boolean;
};
// biome-ignore lint/style/useConsistentTypeDefinitions: type aliases satisfy JsonObject structurally
export type DeviceData = {
  /** Browser installation identifier; a device node is linked separately when one exists. */
  readonly installation: string;
  readonly userAgent: string;
  readonly platform?: string;
  readonly platformVersion?: string;
  readonly model?: string;
  readonly architecture?: string;
  readonly bitness?: string;
  readonly mobile?: boolean;
  readonly browsers?: readonly { readonly name: string; readonly version: string }[];
  readonly languages: readonly string[];
  readonly cores?: number;
  readonly memoryGb?: number;
  readonly touchPoints: number;
  readonly capabilities: {
    readonly geolocation: boolean;
    readonly battery: boolean;
    readonly connection: boolean;
    readonly media: boolean;
  };
};
// biome-ignore lint/style/useConsistentTypeDefinitions: type aliases satisfy JsonObject structurally
export type DisplayData = {
  readonly screen: { readonly width: number; readonly height: number; readonly colorDepth: number };
  readonly viewport: { readonly width: number; readonly height: number; readonly scale?: number };
  readonly pixelRatio: number;
  readonly orientation?: string;
  readonly mode: 'browser' | 'standalone' | 'fullscreen' | 'minimal-ui';
  readonly systemTheme: 'light' | 'dark';
  readonly reducedMotion: boolean;
  readonly contrast: 'more' | 'less' | 'none';
};
// biome-ignore lint/style/useConsistentTypeDefinitions: type aliases satisfy JsonObject structurally
export type ConnectivityData = {
  readonly online: boolean;
  readonly type?: string;
  readonly effectiveType?: string;
  readonly downlinkMbps?: number;
  readonly rttMs?: number;
  readonly saveData?: boolean;
};
// biome-ignore lint/style/useConsistentTypeDefinitions: type aliases satisfy JsonObject structurally
export type PowerData = {
  readonly level: number;
  readonly charging: boolean;
  /** Browser Infinity (unknown duration) is represented as null, never invalid JSON. */
  readonly chargingSeconds: number | null;
  readonly dischargingSeconds: number | null;
};
// biome-ignore lint/style/useConsistentTypeDefinitions: type aliases satisfy JsonObject structurally
export type LocationData = {
  readonly latitude: number;
  readonly longitude: number;
  readonly accuracyM: number;
  readonly altitudeM: number | null;
  readonly altitudeAccuracyM: number | null;
  readonly speedMps: number | null;
  readonly headingDegrees: number | null;
};
// biome-ignore lint/style/useConsistentTypeDefinitions: type aliases satisfy JsonObject structurally
export type AddressData = {
  readonly label: string;
  readonly parts: Readonly<Record<string, string>>;
  readonly latitude: number;
  readonly longitude: number;
  readonly raw: JsonObject;
};
// biome-ignore lint/style/useConsistentTypeDefinitions: type aliases satisfy JsonObject structurally
export type WeatherData = {
  readonly latitude: number;
  readonly longitude: number;
  readonly intervalSeconds: number;
  readonly temperatureC?: number;
  readonly apparentTemperatureC?: number;
  readonly humidityPercent?: number;
  readonly precipitationMm?: number;
  readonly rainMm?: number;
  readonly snowfallCm?: number;
  readonly code?: number;
  readonly cloudPercent?: number;
  readonly windMps?: number;
  readonly windDirectionDegrees?: number;
  readonly gustMps?: number;
  readonly pressureHpa?: number;
  readonly daylight?: boolean;
  /** Provider response retained so later interpretations do not erase its original measurements. */
  readonly raw: JsonObject;
};
// biome-ignore lint/style/useConsistentTypeDefinitions: type aliases satisfy JsonObject structurally
export type AirQualityData = {
  readonly latitude: number;
  readonly longitude: number;
  readonly intervalSeconds: number;
  readonly europeanIndex?: number;
  readonly pm25MicrogramsM3?: number;
  readonly pm10MicrogramsM3?: number;
  readonly carbonMonoxideMicrogramsM3?: number;
  readonly nitrogenDioxideMicrogramsM3?: number;
  readonly ozoneMicrogramsM3?: number;
  readonly sulphurDioxideMicrogramsM3?: number;
  readonly uvIndex?: number;
  readonly raw: JsonObject;
};

/** Add collector payloads and their ingress schema together; the node backing model stays unchanged. */
export interface ObservationValues {
  readonly clock: ClockData;
  readonly app: AppContextData;
  readonly device: DeviceData;
  readonly display: DisplayData;
  readonly connectivity: ConnectivityData;
  readonly power: PowerData;
  readonly location: LocationData;
  readonly address: AddressData;
  readonly weather: WeatherData;
  readonly airQuality: AirQualityData;
}
export type ObservationSubject = keyof ObservationValues;
export type ObservationOutcome<Value> =
  | { readonly status: 'collected'; readonly value: Value; readonly quality?: ObservationQuality }
  | {
      readonly status:
        | 'disabled'
        | 'unsupported'
        | 'denied'
        | 'unavailable'
        | 'timedOut'
        | 'failed';
      readonly reason: { readonly code: string; readonly message?: string };
    };
export type ObservationData = {
  [Subject in ObservationSubject]: {
    readonly kind: 'observation';
    readonly subject: Subject;
    readonly source: ObservationSource;
    readonly time: ObservationTime;
    readonly outcome: ObservationOutcome<ObservationValues[Subject]>;
  };
}[ObservationSubject];

export type InputMethod = 'typed' | 'dictated' | 'pasted' | 'imported' | 'shared';
// biome-ignore lint/style/useConsistentTypeDefinitions: type aliases satisfy JsonObject structurally
export type MessageInput = {
  readonly methods: readonly InputMethod[];
  readonly language?: string;
  readonly transcription?: {
    readonly provider: string;
    readonly model: string;
    readonly request?: string;
    readonly started: string;
    readonly ended: string;
    readonly durationMs?: number;
  };
};
// biome-ignore lint/style/useConsistentTypeDefinitions: type aliases satisfy JsonObject structurally
export type AttachmentData = {
  readonly kind: 'attachment';
  readonly name: string;
  readonly mediaType: string;
  readonly bytes: number;
  readonly sha256: string;
  readonly dimensions?: { readonly width: number; readonly height: number };
  readonly durationMs?: number;
  /** Embedded source metadata, e.g. EXIF; a supplied timestamp is not the submission timestamp. */
  readonly embedded?: JsonObject;
};
// Historical execution metadata delegates to Agent-owned definitions.
import type {
  TextSelection,
  ContextInputData,
  AgentRunData,
  ToolExecutionData,
} from '../../../agent/records.ts';
// biome-ignore lint/style/useConsistentTypeDefinitions: type aliases satisfy JsonObject structurally
export type InterpretationData = {
  readonly kind: 'interpretation';
  readonly category:
    | 'summary'
    | 'topic'
    | 'entity'
    | 'event'
    | 'decision'
    | 'intention'
    | 'ambiguity';
  readonly at: string;
  readonly statement: string;
  readonly details?: JsonObject;
  readonly certainty: 'explicit' | 'inferred' | 'uncertain';
  readonly method: { readonly name: string; readonly version?: string };
};
export type ChatMetadataData = ObservationData | AttachmentData | InterpretationData;
/** Historical ingress supports older execution metadata placed beside messages under an exchange. */
export type MetadataData = ChatMetadataData | ContextInputData | AgentRunData | ToolExecutionData;

/** Link nodes hold their endpoints in connection. Exact links preserve original evidence. */
// biome-ignore lint/style/useConsistentTypeDefinitions: type aliases satisfy JsonObject structurally
export type MetadataReferenceData = {
  readonly kind: 'metadataReference';
  readonly role:
    | 'subject'
    | 'onScreen'
    | 'collector'
    | 'device'
    | 'agent'
    | 'configuration'
    | 'suppliedContext'
    | 'input'
    | 'output'
    | 'evidence'
    | 'corrects'
    | 'derivedFrom'
    | 'place'
    | 'result'
    | 'approval';
  readonly selection?: TextSelection;
  readonly details?: JsonObject;
};
