import 'fake-indexeddb/auto';
import { recordsConformance } from '@contracts/records/conformance.ts';
import { idbRecords, openDb } from './records.ts';

let n = 0;
recordsConformance(() => idbRecords(openDb(`test-${n++}`))('test-ext'));
