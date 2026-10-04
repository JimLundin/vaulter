// Records in this device's storage, through the kernel. Another provider (an embedded database, a
// synced store) replaces it by providing records@1 and passing its conformance suite in CI.
import { defineExtension, perCaller } from '@pip/kernel';
import { records } from '@contracts/records';
import { localRecords } from './records.ts';

export default defineExtension({
  id: 'store-local',
  version: '1.0.0',
  provides: { records },
  agentGuide:
    'Stores records on this device. Pip uses records through the extensions that own them.',
  setup(_, kernel) {
    const { make, forget } = localRecords(kernel.storage);
    return { records: perCaller(make, { forget }) };
  },
});
