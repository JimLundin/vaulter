import { expect, test, vi } from 'vitest';
import type { NodeCommit, NodeStore } from '../../vault/nodes/store.ts';
import { memoryNodeBackend } from '../../vault/nodes/memory.ts';
import { create, request, revise } from '../../vault/nodes/fixtures.test-support.ts';
import { createQuestionAnswers } from './answers.ts';
import { readQuestions } from './reading.ts';

async function fixture() {
  const nodes = memoryNodeBackend();
  await nodes.commit(
    request('asked', [
      create('user', { kind: 'actor', name: 'Owner' }),
      create('question', { kind: 'question', text: 'Which wall?' }),
      create('foreign', { kind: 'content', text: 'Planning' }),
      create('evidence', { kind: 'content', text: 'Garden.' }),
    ]),
  );
  const [question] = await readQuestions(nodes);
  return { nodes, question };
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

test('Answer execution rereads retained relationships outside reachable containment before publishing', async () => {
  const { nodes, question } = await fixture();
  const answers = createQuestionAnswers({ session: {}, nodes, recordedBy: 'user' });
  await nodes.commit(
    request('external-answer', [
      {
        ...create('external', { kind: 'relationship', predicate: 'answered-by' }, 'foreign'),
        connection: { source: question.key, target: { node: 'evidence', transaction: 'asked' } },
      },
    ]),
  );
  await nodes.commit(request('removed-container', [await revise(nodes, 'foreign', null)]));
  await expect(answers.answer(question, 'Another wall.')).rejects.toThrow('no longer open');
  expect((await nodes.history()).some(({ kind }) => kind.scope === 'questions')).toBe(false);
  answers.dispose();
  nodes.close();
});

test('Answer execution retains the exact wording read by the draft and rejects a later edit', async () => {
  const { nodes, question } = await fixture();
  const answers = createQuestionAnswers({ session: {}, nodes, recordedBy: 'user' });
  await nodes.commit(
    request('reworded', [
      await revise(nodes, 'question', { kind: 'question', text: 'Which room?' }),
    ]),
  );
  await expect(answers.answer(question, 'Garden.')).rejects.toThrow('changed');
  expect((await readQuestions(nodes))[0].status).toBe('open');
  const [current] = await readQuestions(nodes);
  await answers.answer(current, '  Garden room.  ');
  const [answered] = await readQuestions(nodes);
  expect(answered.answers[0].version?.data).toEqual({ kind: 'answer', text: 'Garden room.' });
  const transaction = (await nodes.history()).find(({ id }) => id === answered.key.transaction)!;
  expect(transaction).toMatchObject({ recordedBy: 'user', origin: 'question', undoOf: null });
  answers.dispose();
  nodes.close();
});

test('concurrent Answer callers share one request and reject a different draft while it is pending', async () => {
  const { nodes, question } = await fixture();
  const publication = deferred();
  const commit = vi.fn(async (value: NodeCommit) => {
    await publication.promise;
    return nodes.commit(value);
  });
  const answers = createQuestionAnswers({
    session: {},
    nodes: { ...nodes, commit },
    recordedBy: 'user',
  });
  const first = answers.answer(question, 'Garden.');
  const duplicate = answers.answer(question, ' Garden. ');
  expect(duplicate).toBe(first);
  await expect(answers.answer(question, 'Street.')).rejects.toThrow('original answer');
  await vi.waitFor(() => expect(commit).toHaveBeenCalledTimes(1));
  publication.resolve();
  await Promise.all([first, duplicate]);
  expect((await readQuestions(nodes))[0].answers).toHaveLength(1);
  answers.dispose();
  nodes.close();
});

test('uncertain acceptance retries the same complete request after capability replacement without another Answer', async () => {
  const { nodes, question } = await fixture();
  const requests: NodeCommit[] = [];
  const uncertain: NodeStore = {
    ...nodes,
    commit: async (value) => {
      requests.push(value);
      await nodes.commit(value);
      throw new Error('Response lost after acceptance');
    },
  };
  const session = {};
  const answers = createQuestionAnswers({ session, nodes: uncertain, recordedBy: 'user' });
  await expect(answers.answer(question, 'Garden.')).rejects.toThrow('Response lost');
  expect((await readQuestions(nodes))[0].status).toBe('answered');
  answers.configure({
    session,
    nodes: {
      ...nodes,
      commit: (value) => {
        requests.push(value);
        return nodes.commit(value);
      },
    },
    recordedBy: 'changed-author',
  });
  const [refreshed] = await readQuestions(nodes);
  await answers.answer(refreshed, 'Garden.');
  expect(requests).toHaveLength(2);
  expect(requests[1]).toBe(requests[0]);
  expect(requests[1].recordedBy).toBe('user');
  expect((await readQuestions(nodes))[0].answers).toHaveLength(1);
  expect((await nodes.history()).filter(({ kind }) => kind.scope === 'questions')).toHaveLength(1);
  answers.dispose();
  nodes.close();
});

test('retrying after uncertain rejection keeps the original wording guard even when the reader has refreshed', async () => {
  const { nodes, question } = await fixture();
  const session = {};
  const answers = createQuestionAnswers({
    session,
    nodes: {
      ...nodes,
      commit: () => Promise.reject(new Error('Connection lost before acceptance')),
    },
    recordedBy: 'user',
  });
  await expect(answers.answer(question, 'Garden.')).rejects.toThrow('Connection lost');
  await nodes.commit(
    request('reworded', [
      await revise(nodes, 'question', { kind: 'question', text: 'Which room?' }),
    ]),
  );
  answers.configure({ session, nodes, recordedBy: 'user' });
  const [current] = await readQuestions(nodes);
  await expect(answers.answer(current, 'Garden.')).rejects.toThrow('Conflict');
  expect((await readQuestions(nodes))[0].status).toBe('open');
  await answers.answer(current, 'Garden room.');
  expect((await readQuestions(nodes))[0].answers[0].version?.data?.text).toBe('Garden room.');
  answers.dispose();
  nodes.close();
});

test('definitive conflict permits a fresh draft instead of retaining an uncertain request', async () => {
  const { nodes, question } = await fixture();
  let changed = false;
  const answers = createQuestionAnswers({
    session: {},
    nodes: {
      ...nodes,
      commit: async (value) => {
        if (!changed) {
          changed = true;
          await nodes.commit(
            request('reworded', [
              await revise(nodes, 'question', { kind: 'question', text: 'Which room?' }),
            ]),
          );
        }
        return nodes.commit(value);
      },
    },
    recordedBy: 'user',
  });
  await expect(answers.answer(question, 'Garden.')).rejects.toThrow('Conflict');
  const [current] = await readQuestions(nodes);
  await answers.answer(current, 'Garden room.');
  expect((await readQuestions(nodes))[0].answers).toHaveLength(1);
  answers.dispose();
  nodes.close();
});

test.each(['admission', 'dispose', 'session'] as const)(
  '%s change prevents Answer publication after asynchronous reading',
  async (change) => {
    const { nodes, question } = await fixture();
    const reading = deferred();
    const session = {};
    const store: NodeStore = {
      ...nodes,
      snapshot: async (...args) => {
        await reading.promise;
        return nodes.snapshot(...args);
      },
    };
    const commit = vi.spyOn(store, 'commit');
    const answers = createQuestionAnswers({ session, nodes: store, recordedBy: 'user' });
    const answering = answers.answer(question, 'Garden.');
    if (change === 'dispose') answers.dispose();
    else
      answers.configure({
        session: change === 'session' ? {} : session,
        nodes: store,
        recordedBy: 'user',
        availability: 'Reconnect before answering.',
      });
    reading.resolve();
    await expect(answering).rejects.toThrow(change === 'admission' ? 'Reconnect' : 'closed');
    expect(commit).not.toHaveBeenCalled();
    answers.dispose();
    nodes.close();
  },
);

test('session disposal does not interrupt publication that has already entered the store', async () => {
  const { nodes, question } = await fixture();
  const publication = deferred();
  const commit = vi.fn(async (value: NodeCommit) => {
    await publication.promise;
    return nodes.commit(value);
  });
  const answers = createQuestionAnswers({
    session: {},
    nodes: { ...nodes, commit },
    recordedBy: 'user',
  });
  const answering = answers.answer(question, 'Garden.');
  await vi.waitFor(() => expect(commit).toHaveBeenCalledTimes(1));
  answers.dispose();
  publication.resolve();
  await answering;
  expect((await readQuestions(nodes))[0].status).toBe('answered');
  await expect(answers.answer(question, 'Garden.')).rejects.toThrow('closed');
  nodes.close();
});

test('authoritative admission blocks a save when session state changes without a render', async () => {
  const { nodes, question } = await fixture();
  const reading = deferred();
  let reason: string | undefined;
  const commit = vi.fn(nodes.commit);
  const answers = createQuestionAnswers({
    session: {},
    nodes: {
      ...nodes,
      commit,
      snapshot: async (...args) => {
        await reading.promise;
        return nodes.snapshot(...args);
      },
    },
    recordedBy: 'user',
    admission: () => reason,
  });
  const answering = answers.answer(question, 'Garden.');
  reason = 'The session is signing out.';
  reading.resolve();
  await expect(answering).rejects.toThrow('signing out');
  expect(commit).not.toHaveBeenCalled();
  answers.dispose();
  nodes.close();
});

test('replacing the node capability during preparation rereads it on the next Answer attempt', async () => {
  const { nodes, question } = await fixture();
  const reading = deferred();
  const session = {};
  const originalCommit = vi.fn(nodes.commit);
  const original: NodeStore = {
    ...nodes,
    commit: originalCommit,
    snapshot: async (...args) => {
      await reading.promise;
      return nodes.snapshot(...args);
    },
  };
  const replacementCommit = vi.fn(nodes.commit);
  const replacement: NodeStore = { ...nodes, commit: replacementCommit };
  const answers = createQuestionAnswers({ session, nodes: original, recordedBy: 'user' });
  const answering = answers.answer(question, 'Garden.');
  answers.configure({ session, nodes: replacement, recordedBy: 'user' });
  reading.resolve();
  await expect(answering).rejects.toThrow('node store changed');
  expect(originalCommit).not.toHaveBeenCalled();
  expect(replacementCommit).not.toHaveBeenCalled();
  await answers.answer(question, 'Garden.');
  expect(replacementCommit).toHaveBeenCalledTimes(1);
  answers.dispose();
  nodes.close();
});
