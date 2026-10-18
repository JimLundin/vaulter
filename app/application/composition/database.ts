import { e, openDatabase, type JournalStorage } from '@/core/store/index.ts';
import { chatSchema } from '@/modules/conversation/index.ts';
import { wikiEntities } from '@/modules/wiki/index.ts';
import { graphEntities } from '@/modules/graph/index.ts';
import { questionEntities } from '@/modules/questions/index.ts';
import { calendarEntities } from '@/modules/calendar/index.ts';
import { mapEntities } from '@/modules/map/index.ts';
import { sourceEntities } from '@/modules/sources/index.ts';
import { evidenceEntities } from '@/modules/wiki/index.ts';
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
