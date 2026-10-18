import { z } from 'zod';

/** Existing version-only records remain known; unknown history never invents a version string. */
export type RecordedToolVersion =
  | { readonly version: string; readonly versionStatus?: never }
  | { readonly versionStatus: 'unknown'; readonly version?: never };

export function recordedToolVersion(tool: {
  readonly version?: string;
  readonly versionStatus?: 'unknown';
}): RecordedToolVersion {
  if (tool.versionStatus === 'unknown') {
    if (tool.version !== undefined)
      throw new Error('Unknown tool version cannot include a version');
    return { versionStatus: 'unknown' };
  }
  z.string().trim().min(1).parse(tool.version);
  return { version: z.string().parse(tool.version) };
}

export function knownToolVersion(tool: {
  readonly version?: string;
  readonly versionStatus?: 'unknown';
}): string {
  const recorded = recordedToolVersion(tool);
  if (recorded.version === undefined) throw new Error('Live tools require a known version');
  return recorded.version;
}
