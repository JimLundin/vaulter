export interface HistoryEntry {
  readonly key: string;
  readonly title: string;
  readonly recordedAt: string;
  readonly sequence: number;
  readonly author?: string;
  readonly origin?: string;
  readonly details: readonly string[];
  readonly changes?: readonly {
    readonly title: string;
    readonly fields: readonly {
      readonly label: string;
      readonly before: string;
      readonly after: string;
    }[];
  }[];
  readonly undo?: () => Promise<unknown>;
}
export interface HistorySource {
  readonly entries: (options?: {
    readonly before?: string;
    readonly limit?: number;
  }) => Promise<readonly HistoryEntry[]>;
  readonly subscribe: (listener: () => void) => () => void;
}
