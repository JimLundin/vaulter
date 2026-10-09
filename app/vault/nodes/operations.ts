/** Features extend this catalogue through module augmentation; no unrestricted string fallback. */
export interface TransactionActions {
  readonly node: 'create' | 'update' | 'move' | 'delete' | 'restore' | 'detach' | 'fork';
  readonly transaction: 'undo';
}

/** Scope determines its allowed actions, so invalid scope/action combinations fail typechecking. */
export type TransactionKind = {
  [Scope in keyof TransactionActions]: {
    readonly scope: Scope;
    readonly action: TransactionActions[Scope];
  };
}[keyof TransactionActions];

export const nodeOperations = {
  create: { scope: 'node', action: 'create' },
  update: { scope: 'node', action: 'update' },
  move: { scope: 'node', action: 'move' },
  delete: { scope: 'node', action: 'delete' },
  restore: { scope: 'node', action: 'restore' },
  detach: { scope: 'node', action: 'detach' },
  fork: { scope: 'node', action: 'fork' },
} as const satisfies Readonly<Record<TransactionActions['node'], TransactionKind>>;

export const transactionOperations = {
  undo: { scope: 'transaction', action: 'undo' },
} as const satisfies Readonly<Record<TransactionActions['transaction'], TransactionKind>>;

/** Stored JSON is matched by value, never object identity or a parsed string convention. */
export const sameOperation = (left: TransactionKind, right: TransactionKind): boolean =>
  left.scope === right.scope && left.action === right.action;
