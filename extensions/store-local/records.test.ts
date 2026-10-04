import suite from '@contracts/records/conformance.ts';
import { records } from '@contracts/records';
import { memoryStorage } from '../../src/kernel/storage.ts';
import { conformanceInVitest } from '../../src/kernel/testing.ts';
import { localRecords } from './records.ts';

const storageFor = (ns: string) => {
  const s = memoryStorage();
  return {
    get: <T>(k: string) => s.get(ns, k) as Promise<T | undefined>,
    set: (k: string, v: unknown) => s.set(ns, k, v),
    delete: (k: string) => s.delete(ns, k),
    list: <T>(p = '') => s.list(ns, p) as Promise<[string, T][]>,
  };
};

conformanceInVitest(suite, (n) => {
  const caller = `check-${n}`;
  return records.client!(localRecords(storageFor('store-local')).make(caller), { caller });
});
