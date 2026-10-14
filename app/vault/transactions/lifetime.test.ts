import { describe, expect, it, vi } from 'vitest';
import { memoryNodeBackend } from '../nodes/memory.ts';
import { create, seed } from '../nodes/fixtures.test-support.ts';
import { nodeOperations } from '../nodes/operations.ts';
import { NodePublicationRejected } from '../nodes/history.ts';
import type { NodeCommit } from '../nodes/store.ts';
import {
  createTransactionSession,
  PreparationReplaced,
  WriteClosed,
  withPublication,
} from './lifetime.ts';
import { composeChanges } from './composition.ts';
import type { TransactionRequest } from './store.ts';

const deferred = <T>() => {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};
const draft = (node: string) => ({
  changes: [create(node, { kind: 'content', text: node })],
  kind: nodeOperations.create,
  message: null,
  undoOf: null,
});
const author = { recordedBy: 'user', origin: null };

describe('Transaction write lifetimes', () => {
  it('allocates identity and trusted context before calculation, and freezes only persisted JSON', async () => {
    const memory = memoryNodeBackend();
    await seed(memory);
    const session = createTransactionSession(memory);
    const owner = { callback: () => 'owner', node: { title: 'mutable' } };
    const transaction = draft('one');
    const permission = vi.fn();
    const changedPermission = vi.fn(() => {
      throw new Error('Changed permission');
    });
    const input = { ...author, publication: permission };
    const writer = withPublication(session.nodes, () => undefined).writer(input);
    input.recordedBy = 'changed-author';
    input.publication = changedPermission;
    using scope = writer.lifetime();
    const request = scope.prepare((context) => {
      expect(context.id).toBeTruthy();
      expect(context.recordedBy).toBe('user');
      expect('commit' in context.nodes).toBe(false);
      return { value: owner, transaction };
    });
    expect('commit' in session.nodes).toBe(false);
    expect(await request.ready).toBe(owner);
    transaction.changes[0] = create('wrong', { kind: 'content' });
    owner.node.title = 'still mutable';
    const receipt = await request.accept();
    expect(receipt.value).toBe(owner);
    expect(permission).toHaveBeenCalledOnce();
    expect(changedPermission).not.toHaveBeenCalled();
    expect(receipt.transaction.id).toBe(request.id);
    expect((await memory.snapshot()).get('one')?.key.transaction).toBe(request.id);
    expect((await memory.snapshot()).get('wrong')).toBeUndefined();
  });

  it('using closes pre-entry publication while finalized work survives for explicit recovery', async () => {
    const memory = memoryNodeBackend();
    await seed(memory);
    const session = createTransactionSession(memory);
    let request!: TransactionRequest<string>;
    {
      using scope = session.nodes.writer(author).lifetime();
      request = scope.write(() => ({ value: 'retained', transaction: draft('one') }));
    }
    await expect(request.result).rejects.toBeInstanceOf(WriteClosed);
    expect(request.snapshot()).toMatchObject({ phase: 'blocked', finalized: true, attempts: 0 });
    using recovery = session.nodes.writer(author).lifetime();
    const accepted = await recovery.retry(request);
    expect(accepted.value).toBe('retained');
    expect(request.snapshot().phase).toBe('accepted');
    await expect(request.result).rejects.toBeInstanceOf(WriteClosed);
  });

  it('await using closes synchronously and drains the entered adapter through outcome recording', async () => {
    const memory = memoryNodeBackend();
    await seed(memory);
    const gate = deferred<void>();
    const entered = deferred<void>();
    const session = createTransactionSession({
      ...memory,
      commit: async (request) => {
        entered.resolve();
        await gate.promise;
        return memory.commit(request);
      },
    });
    const scope = session.nodes.writer(author).lifetime();
    const request = scope.write(() => ({ value: 'one', transaction: draft('one') }));
    await entered.promise;
    let drained = false;
    const finish = (async () => {
      await using _lifetime = scope;
    })().then(() => {
      drained = true;
    });
    expect(() => scope.write(() => ({ value: 2, transaction: draft('two') }))).toThrow(WriteClosed);
    await Promise.resolve();
    expect(drained).toBe(false);
    gate.resolve();
    await finish;
    expect(request.snapshot().phase).toBe('accepted');
    expect((await request.result).transaction.id).toBe(request.id);
  });

  it('disposal does not wait for an arbitrary calculation or publish its late result', async () => {
    const memory = memoryNodeBackend();
    await seed(memory);
    const session = createTransactionSession(memory);
    const gate = deferred<void>();
    let request!: TransactionRequest<void>;
    {
      await using scope = session.nodes.writer(author).lifetime();
      request = scope.write(async () => {
        await gate.promise;
        return { value: undefined, transaction: draft('late') };
      });
    }
    await expect(request.ready).rejects.toBeInstanceOf(WriteClosed);
    gate.resolve();
    await Promise.resolve();
    expect((await memory.snapshot()).get('late')).toBeUndefined();
  });

  it('repeated acceptance shares one original attempt and using does not dispose a shared adapter', async () => {
    const memory = memoryNodeBackend();
    await seed(memory);
    const commit = vi.fn(memory.commit);
    const session = createTransactionSession({ ...memory, commit });
    using scope = session.nodes.writer(author).lifetime();
    const request = scope.prepare(() => ({ value: 1, transaction: draft('one') }));
    expect(request.accept()).toBe(request.accept());
    await request.result;
    scope.close();
    expect(commit).toHaveBeenCalledTimes(1);
    expect((await memory.snapshot()).get('one')).toBeDefined();
  });

  it('retries exact finalized contents without recalculation after a lost response', async () => {
    const memory = memoryNodeBackend();
    await seed(memory);
    const lost = new Error('Response lost');
    const calls: NodeCommit[] = [];
    const session = createTransactionSession({
      ...memory,
      commit: async (request) => {
        calls.push(request);
        const transaction = await memory.commit(request);
        if (calls.length === 1) throw lost;
        return transaction;
      },
    });
    const calculate = vi.fn(() => ({ value: { id: 'owner' }, transaction: draft('one') }));
    let request!: TransactionRequest<{ id: string }>;
    {
      using scope = session.nodes.writer(author).lifetime();
      request = scope.write(calculate);
      await expect(request.result).rejects.toBe(lost);
    }
    using retry = session.nodes.writer(author).lifetime();
    const receipt = await retry.retry(request);
    expect(calls[0]).toBe(calls[1]);
    expect(calculate).toHaveBeenCalledTimes(1);
    expect(receipt.transaction.sequence).toBe(2);
    await expect(request.result).rejects.toBe(lost);
    expect(request.snapshot()).toMatchObject({ phase: 'accepted', attempts: 2 });
  });

  it('coalesces attempts for one request and permits independent requests to enter concurrently', async () => {
    const memory = memoryNodeBackend();
    await seed(memory);
    const gate = deferred<void>();
    const calls: string[] = [];
    const session = createTransactionSession({
      ...memory,
      commit: async (request) => {
        calls.push(request.id);
        await gate.promise;
        return memory.commit(request);
      },
    });
    using scope = session.nodes.writer(author).lifetime();
    const first = scope.prepare(() => ({ value: 1, transaction: draft('one') }));
    const retry = scope.retry(first);
    expect(scope.retry(first)).toBe(retry);
    const second = scope.write(() => ({ value: 2, transaction: draft('two') }));
    await second.ready;
    expect(calls).toEqual([first.id, second.id]);
    gate.resolve();
    await Promise.all([retry, second.result]);
  });

  it.each(['publishing', 'accepted'] as const)(
    'closing preparation settles the original result after recovery is %s',
    async (phase) => {
      const memory = memoryNodeBackend();
      await seed(memory);
      const gate = deferred<void>();
      const session = createTransactionSession({
        ...memory,
        commit: async (request) => {
          await gate.promise;
          return memory.commit(request);
        },
      });
      using original = session.nodes.writer(author).lifetime();
      const request = original.prepare(() => ({ value: 'retained', transaction: draft('one') }));
      using recovery = session.nodes.writer(author).lifetime();
      const retried = recovery.retry(request);
      if (phase === 'accepted') {
        gate.resolve();
        await retried;
      }
      original.close();
      await expect(request.result).rejects.toBeInstanceOf(WriteClosed);
      expect(request.snapshot().phase).toBe(phase);
      gate.resolve();
      expect((await retried).value).toBe('retained');
      await expect(request.accept()).rejects.toBeInstanceOf(WriteClosed);
    },
  );

  it('fresh recovery checks its current admission and retains original attribution and publication permission', async () => {
    const memory = memoryNodeBackend();
    await seed(memory);
    const session = createTransactionSession(memory);
    const publication = vi.fn();
    let admitted = true;
    using original = session.nodes
      .writer({
        ...author,
        publication,
        admission: () => {
          if (!admitted) throw new WriteClosed('Owner is unavailable');
        },
      })
      .lifetime();
    const calculate = vi.fn(() => ({ value: 'retained', transaction: draft('one') }));
    const request = original.prepare(calculate);
    admitted = false;
    await expect(request.accept()).rejects.toThrow('Owner is unavailable');
    expect(request.snapshot()).toMatchObject({ phase: 'blocked', finalized: true, attempts: 0 });
    using wrongAuthor = session.nodes.writer({ recordedBy: 'another', origin: null }).lifetime();
    await expect(wrongAuthor.retry(request)).rejects.toThrow('original writer context');
    using otherSession = createTransactionSession(memory).nodes.writer(author).lifetime();
    await expect(otherSession.retry(request)).rejects.toThrow('different session');
    using recovery = session.nodes.writer(author).lifetime();
    await recovery.retry(request);
    expect(publication).toHaveBeenCalledOnce();
    expect(calculate).toHaveBeenCalledOnce();
    await expect(request.result).rejects.toThrow('Owner is unavailable');
  });

  it('async disposal of a coalesced attempt waits for the original persistence outcome', async () => {
    const memory = memoryNodeBackend();
    await seed(memory);
    const gate = deferred<void>();
    const session = createTransactionSession({
      ...memory,
      commit: async (request) => {
        await gate.promise;
        return memory.commit(request);
      },
    });
    using first = session.nodes.writer(author).lifetime();
    const request = first.prepare(() => ({ value: 1, transaction: draft('one') }));
    const original = first.retry(request);
    const second = session.nodes.writer(author).lifetime();
    expect(second.retry(request)).toBe(original);
    let drained = false;
    const disposal = second[Symbol.asyncDispose]().then(() => {
      drained = true;
    });
    await Promise.resolve();
    expect(drained).toBe(false);
    gate.resolve();
    await disposal;
    expect(request.snapshot().phase).toBe('accepted');
  });

  it('rejects unfinished preparation on replacement and retains finalized requests', async () => {
    const memory = memoryNodeBackend();
    await seed(memory);
    const session = createTransactionSession(memory);
    const gate = deferred<void>();
    using scope = session.nodes.writer(author).lifetime();
    const unfinished = scope.prepare(async () => {
      await gate.promise;
      return { value: 1, transaction: draft('one') };
    });
    const finalized = scope.prepare(() => ({ value: 2, transaction: draft('two') }));
    const previous = session.nodes;
    await session.replace(memory);
    await expect(unfinished.ready).rejects.toBeInstanceOf(PreparationReplaced);
    expect(session.nodes).not.toBe(previous);
    expect(session.nodes.identity).toBe(previous.identity);
    gate.resolve();
    await finalized.accept();
    expect((await memory.snapshot()).get('two')).toBeDefined();
  });

  it('replacement preserves new calculations started by observers of invalidated requests', async () => {
    const memory = memoryNodeBackend();
    await seed(memory);
    const session = createTransactionSession(memory);
    const gate = deferred<void>();
    using scope = session.nodes.writer(author).lifetime();
    const previous = scope.prepare(async () => {
      await gate.promise;
      return { value: 'previous', transaction: draft('previous') };
    });
    let next: TransactionRequest<string> | undefined;
    previous.subscribe(() => {
      if (previous.snapshot().phase === 'rejected')
        next = scope.write(async () => {
          await gate.promise;
          return { value: 'next', transaction: draft('next') };
        });
    });
    await session.replace(memory);
    await expect(previous.ready).rejects.toBeInstanceOf(PreparationReplaced);
    expect(next?.snapshot().phase).toBe('calculating');
    gate.resolve();
    expect((await next!.result).value).toBe('next');
    expect((await memory.snapshot()).get('previous')).toBeUndefined();
  });

  it('retires adapters only after entered work and stops retry immediately on session close', async () => {
    const memory = memoryNodeBackend();
    await seed(memory);
    const gate = deferred<void>();
    const entered = deferred<void>();
    const session = createTransactionSession({
      ...memory,
      commit: async (request) => {
        entered.resolve();
        await gate.promise;
        return memory.commit(request);
      },
    });
    using scope = session.nodes.writer(author).lifetime();
    const request = scope.write(() => ({ value: 1, transaction: draft('one') }));
    await entered.promise;
    const retired = vi.fn();
    const replacing = session.replace(memory, retired);
    expect(retired).not.toHaveBeenCalled();
    session.close();
    await expect(scope.retry(request)).rejects.toBeInstanceOf(WriteClosed);
    const drain = session.drain();
    gate.resolve();
    await Promise.all([drain, replacing]);
    expect(retired).toHaveBeenCalledOnce();
    expect(request.snapshot().phase).toBe('accepted');
  });

  it('ends structurally rejected requests and rejects contradictory composition before persistence', async () => {
    const memory = memoryNodeBackend();
    await seed(memory);
    const commit = vi.fn(memory.commit);
    const session = createTransactionSession({ ...memory, commit });
    using scope = session.nodes.writer(author).lifetime();
    const invalid = scope.write(() => ({
      value: 1,
      transaction: {
        ...draft('one'),
        changes: [create('one', { kind: 'content' }, 'missing')],
      },
    }));
    await expect(invalid.result).rejects.toBeInstanceOf(NodePublicationRejected);
    await expect(scope.retry(invalid)).rejects.toBeInstanceOf(NodePublicationRejected);
    expect(commit).toHaveBeenCalledTimes(1);
    expect(() => composeChanges(draft('one'), draft('one'))).toThrow('Duplicate changed Node');
    expect(() =>
      composeChanges(draft('two'), { changes: [], expectedReads: { two: 'other' } }),
    ).toThrow('Contradictory');
    expect(() =>
      composeChanges(
        { changes: [], expectedReads: { user: 'one' } },
        { changes: [], expectedReads: { user: 'two' } },
      ),
    ).toThrow('Contradictory');
    expect(
      composeChanges(draft('one'), { changes: [], expectedReads: { one: null } }).expectedReads,
    ).toEqual({ one: null });
  });
});
