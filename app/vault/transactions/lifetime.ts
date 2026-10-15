import './disposal.ts';
import type { NodeCommit, NodePublicationRule, NodeReading, NodeStore } from '../nodes/store.ts';
import { NodeConflict, NodePublicationRejected } from '../nodes/history.ts';
import { frozen } from '../nodes/json.ts';
import { parseCommit } from '../nodes/validation.ts';
import { composeChanges } from './composition.ts';
import type {
  Calculated,
  Calculation,
  PreparedRequest,
  Receipt,
  RequestState,
  TransactionRequest,
  TransactionStore,
  WriteLifetime,
  WriterContext,
} from './store.ts';

export class WriteClosed extends Error {
  override readonly name = 'WriteClosed';
}
export class PreparationReplaced extends Error {
  override readonly name = 'PreparationReplaced';
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  const value = { promise, resolve, reject };
  // Handles may outlive their initiating action; their rejection is still available to consumers.
  void value.promise.catch(() => undefined);
  return value;
}
function notify(listeners: Set<() => void>) {
  for (const listener of listeners) {
    try {
      listener();
    } catch {
      /* Observers cannot change persistence outcomes. */
    }
  }
}
const reading = (source: NodeReading): NodeReading =>
  Object.freeze({
    snapshot: (sequence?: number) => source.snapshot(sequence),
    history: (options?: Parameters<NodeReading['history']>[0]) => source.history(options),
    changes: (transaction: string) => source.changes(transaction),
    subscribe: (listener: () => void) => source.subscribe(listener),
  });

interface Adapter {
  readonly store: NodeStore;
  readonly entered: Set<Promise<unknown>>;
}
interface Request<V> {
  readonly recordedBy: string;
  readonly origin: string | null;
  readonly publication?: NodePublicationRule;
  readonly ready: ReturnType<typeof deferred<V>>;
  readonly initial: ReturnType<typeof deferred<Receipt<V>>>;
  readonly listeners: Set<() => void>;
  initialAdmitted: boolean;
  cancelCalculation?: (error: unknown) => void;
  state: RequestState;
  finalized?: NodeCommit;
  value?: V;
  current?: Promise<Receipt<V>>;
  receipt?: Receipt<V>;
}

/** One unlocked session owns request identity, admission, immutable finalization and adapter leases. */
export function createTransactionSession(initial: NodeStore | null = null) {
  let generation = 0;
  let closed: unknown;
  let isClosed = false;
  let adapter: Adapter | undefined;
  let unsubscribe: (() => void) | undefined;
  const adapters = new Set<Adapter>();
  const listeners = new Set<() => void>();
  const lifetimes = new Set<(reason: unknown) => void>();
  const calculations = new Set<(reason: unknown) => void>();
  const requests = new WeakMap<object, Request<unknown>>();
  const identity = Object.freeze({});
  const available = () => {
    if (isClosed) throw closed;
    if (!adapter) throw new WriteClosed('Node store is unavailable.');
    return adapter;
  };
  const update = <V>(request: Request<V>, patch: Partial<RequestState>) => {
    request.state = Object.freeze({ ...request.state, ...patch });
    notify(request.listeners);
  };
  const facade: TransactionStore = Object.freeze({
    identity,
    snapshot: (sequence?: number) => available().store.snapshot(sequence),
    history: (options?: Parameters<NodeReading['history']>[0]) =>
      available().store.history(options),
    changes: (transaction: string) => available().store.changes(transaction),
    subscribe: (listener: () => void) => {
      if (isClosed) return () => undefined;
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    writer: (input: WriterContext) => {
      const context = Object.freeze({ ...input });
      return Object.freeze({
        lifetime: (options: { readonly signal?: AbortSignal } = {}): WriteLifetime => {
          let ended = false;
          let reason: unknown;
          const preparing = new Set<Request<unknown>>();
          const entered = new Set<Promise<unknown>>();
          const check = () => {
            if (ended) throw reason;
            const active = available();
            context.admission?.();
            // Admission callbacks may synchronously stop a session or this lifetime.
            if (ended) throw reason;
            if (available() !== active)
              throw new PreparationReplaced('The node store changed before publication.');
            return active;
          };
          const close = (error: unknown = new WriteClosed('This write lifetime is closed.')) => {
            if (ended) return;
            ended = true;
            reason = error;
            options.signal?.removeEventListener('abort', cancelled);
            lifetimes.delete(close);
            for (const request of preparing) {
              request.cancelCalculation?.(error);
              if (request.state.phase === 'prepared') update(request, { phase: 'blocked', error });
              if (!request.initialAdmitted) request.initial.reject(error);
            }
            preparing.clear();
          };
          const cancelled = () => close(options.signal!.reason);
          lifetimes.add(close);
          options.signal?.addEventListener('abort', cancelled, { once: true });
          if (options.signal?.aborted) cancelled();
          if (isClosed) close(closed);
          const track = <V>(promise: Promise<Receipt<V>>) => {
            entered.add(promise);
            void promise.then(
              () => entered.delete(promise),
              () => entered.delete(promise),
            );
            return promise;
          };
          const attempt = <V>(request: Request<V>, initial = false): Promise<Receipt<V>> => {
            let active: Adapter;
            try {
              active = check();
              if (!request.finalized) throw new WriteClosed('The request has not finalized.');
              if (request.state.phase === 'rejected') throw request.state.error;
              if (initial) request.initialAdmitted = true;
              if (request.current !== undefined) return track(request.current);
              if (request.receipt) return Promise.resolve(request.receipt);
            } catch (error) {
              if (
                request.finalized &&
                request.current === undefined &&
                !request.receipt &&
                request.state.phase !== 'rejected'
              )
                update(request, { phase: 'blocked', error });
              return Promise.reject(error);
            }
            // Registration covers the original adapter promise and recording its outcome. Neither
            // consumer cancellation nor disposal substitutes a shorter-lived wait for this lease.
            const completed = deferred<Receipt<V>>();
            request.current = completed.promise;
            active.entered.add(completed.promise);
            entered.add(completed.promise);
            update(request, {
              phase: 'publishing',
              attempts: request.state.attempts + 1,
              error: undefined,
            });
            let persistence: ReturnType<NodeStore['commit']>;
            try {
              persistence = active.store.commit(request.finalized!, request.publication);
            } catch (error) {
              persistence = Promise.reject(error);
            }
            void persistence.then(
              (transaction) => {
                const receipt = Object.freeze({ value: request.value as V, transaction });
                request.receipt = receipt;
                update(request, { phase: 'accepted', transaction, error: undefined });
                request.current = undefined;
                active.entered.delete(completed.promise);
                entered.delete(completed.promise);
                completed.resolve(receipt);
              },
              (error: unknown) => {
                update(request, {
                  phase:
                    error instanceof NodeConflict || error instanceof NodePublicationRejected
                      ? 'rejected'
                      : 'uncertain',
                  error,
                });
                request.current = undefined;
                active.entered.delete(completed.promise);
                entered.delete(completed.promise);
                completed.reject(error);
              },
            );
            return completed.promise;
          };
          const prepare = <V>(calculate: Calculation<V>): PreparedRequest<V> => {
            const selected = check();
            const capturedGeneration = generation;
            const id = crypto.randomUUID();
            const request: Request<V> = {
              recordedBy: context.recordedBy,
              origin: context.origin,
              publication: context.publication,
              ready: deferred<V>(),
              initial: deferred<Receipt<V>>(),
              listeners: new Set(),
              initialAdmitted: false,
              state: Object.freeze({ phase: 'calculating', finalized: false, attempts: 0 }),
            };
            const opaque = request as Request<unknown>;
            preparing.add(opaque);
            void request.initial.promise.then(
              () => preparing.delete(opaque),
              () => preparing.delete(opaque),
            );
            let started = false;
            const accept = () => {
              if (!started) {
                started = true;
                void request.ready.promise
                  .then(() => attempt(request, true))
                  .then(request.initial.resolve, request.initial.reject);
              }
              return request.initial.promise;
            };
            const handle: PreparedRequest<V> = Object.freeze({
              id,
              ready: request.ready.promise,
              result: request.initial.promise,
              snapshot: () => request.state,
              subscribe: (listener: () => void) => {
                request.listeners.add(listener);
                return () => {
                  request.listeners.delete(listener);
                };
              },
              accept,
            });
            requests.set(handle, opaque);
            const abort = new AbortController();
            const calculated = () => {
              calculations.delete(failed);
              request.cancelCalculation = undefined;
            };
            const failed = (error: unknown) => {
              if (request.state.phase !== 'calculating') return;
              calculated();
              update(request, { phase: 'rejected', error });
              request.ready.reject(error);
              request.initial.reject(error);
              abort.abort(error);
            };
            request.cancelCalculation = failed;
            calculations.add(failed);
            const finalize = (result: Calculated<V>) => {
              if (request.state.phase !== 'calculating') return;
              try {
                const { value, transaction } = result;
                check();
                if (capturedGeneration !== generation)
                  throw new PreparationReplaced(
                    'The node store changed during calculation. Start a new request.',
                  );
                const composed = composeChanges(transaction);
                // Only persisted JSON is copied and frozen. Arbitrary owner values keep their identity.
                request.finalized = frozen(
                  structuredClone(
                    parseCommit({
                      ...transaction,
                      ...composed,
                      id,
                      recordedBy: context.recordedBy,
                      origin: context.origin,
                    }),
                  ),
                );
                request.value = value;
                calculated();
                update(request, { phase: 'prepared', finalized: true });
                request.ready.resolve(value);
              } catch (error) {
                failed(error);
              }
            };
            try {
              const result = calculate(
                Object.freeze({
                  id,
                  recordedBy: context.recordedBy,
                  origin: context.origin,
                  nodes: reading(selected.store),
                  signal: abort.signal,
                }),
              );
              if (result instanceof Promise) void result.then(finalize, failed);
              else finalize(result);
            } catch (error) {
              failed(error);
            }
            return handle;
          };
          return Object.freeze({
            prepare,
            write: <V>(calculate: Calculation<V>) => {
              const request = prepare(calculate);
              void request.accept();
              return request;
            },
            retry: <V>(handle: TransactionRequest<V>) => {
              const request = requests.get(handle) as Request<V> | undefined;
              if (!request)
                return Promise.reject(
                  new WriteClosed('This request belongs to a different session.'),
                );
              if (request.recordedBy !== context.recordedBy || request.origin !== context.origin)
                return Promise.reject(
                  new WriteClosed('Retry requires the original writer context.'),
                );
              return attempt(request);
            },
            close,
            [Symbol.dispose]: () => {
              close();
            },
            [Symbol.asyncDispose]: async () => {
              close();
              await Promise.allSettled([...entered]);
            },
          });
        },
      });
    },
  });
  let nodes = facade;
  const replace = (store: NodeStore | null, retire?: (store: NodeStore) => void) => {
    if (isClosed) throw closed;
    const previous = adapter;
    const invalidated = [...calculations];
    generation++;
    unsubscribe?.();
    adapter = store ? { store, entered: new Set() } : undefined;
    if (adapter) adapters.add(adapter);
    // A new facade invalidates owner reads while identity and the request registry stay in session.
    // Previously borrowed facades still direct new calls to the current adapter.
    nodes = Object.freeze({ ...facade });
    for (const cancel of invalidated)
      cancel(
        new PreparationReplaced('The node store changed during calculation. Start a new request.'),
      );
    unsubscribe = store?.subscribe(() => notify(listeners));
    notify(listeners);
    return (async () => {
      if (!previous) return;
      await Promise.allSettled([...previous.entered]);
      adapters.delete(previous);
      retire?.(previous.store);
    })();
  };
  if (initial) void replace(initial);
  return {
    get nodes() {
      return nodes;
    },
    replace,
    close: (reason: unknown = new WriteClosed('The vault session has closed.')) => {
      if (isClosed) return;
      isClosed = true;
      closed = reason;
      generation++;
      for (const close of lifetimes) close(reason);
      unsubscribe?.();
      listeners.clear();
    },
    drain: async () => {
      await Promise.allSettled([...adapters].flatMap((selected) => [...selected.entered]));
    },
  };
}

/** Application adds owner publication rules without exposing the persistence adapter. */
export function withPublication(
  nodes: TransactionStore,
  publication: NodePublicationRule,
): TransactionStore {
  return Object.freeze({
    ...reading(nodes),
    identity: nodes.identity,
    writer: (context: WriterContext) => {
      const additional = context.publication;
      return nodes.writer({
        ...context,
        publication: (value) => {
          publication(value);
          additional?.(value);
        },
      });
    },
  });
}
