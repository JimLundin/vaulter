// Records in this browser, in store-local's own IndexedDB database. Another provider (one that keeps
// them in git, an embedded database) replaces it by providing records@1 and passing its conformance
// suite in CI.

import { records } from '#contracts/records';
import { defineExtension, perCaller } from '#kernel';
import { localRecords } from './records.ts';
import { idbStore } from './store.ts';

export default defineExtension({
  id: 'store-local',
  version: '1.0.0',
  provides: { records },
  agentGuide:
    'Stores records on this device. Vaulter uses records through the extensions that own them.',
  async setup() {
    const { make, forget } = await localRecords(idbStore());
    return { records: perCaller(make, { forget }) };
  },
});
