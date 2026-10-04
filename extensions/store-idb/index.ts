// Storage for records@1 in this browser's IndexedDB. Another provider (an embedded database, a synced
// store) replaces it by providing the same contract and passing its conformance suite.
import { defineExtension, perCaller } from '@pip/kernel';
import { records } from '@contracts/records';
import { idbRecords, openDb } from './records.ts';

export default defineExtension({
  id: 'store-idb',
  version: '1.0.0',
  provides: { records },
  agentGuide:
    'Stores records in the browser. Pip uses records through the extensions that own them.',
  setup: () => ({ records: perCaller(idbRecords(openDb())) }),
});
