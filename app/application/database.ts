import { e, openDatabase, type JournalStorage } from './store/index.ts';
import { chatSchema } from '@/conversation/index.ts';
import { wikiEntities } from '@/wiki/index.ts';
import { graphEntities } from '@/graph/index.ts';
import { questionEntities } from '@/questions/index.ts';
import { calendarEntities } from '@/calendar/index.ts';
import { mapEntities } from '@/map/index.ts';
import { sourceEntities } from '@/sources/index.ts';
import { evidenceEntities } from '@/wiki/index.ts';
/** The same explicit composition used by the Application views and independent application callers. */
export const applicationSchema = e.registry({
  ...chatSchema,
  ...wikiEntities,
  ...sourceEntities,
  ...evidenceEntities,
  ...graphEntities,
  ...calendarEntities,
  ...mapEntities,
  ...questionEntities,
});
const applicationDatabases = new WeakMap<
  JournalStorage,
  ReturnType<typeof openDatabase<typeof applicationSchema>>
>();
export function applicationDatabase(storage: JournalStorage) {
  let database = applicationDatabases.get(storage);
  if (!database) {
    database = openDatabase({ schema: applicationSchema, storage }).catch((error) => {
      applicationDatabases.delete(storage);
      throw error;
    });
    applicationDatabases.set(storage, database);
  }
  return database;
}
