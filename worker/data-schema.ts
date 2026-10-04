// Keep new installations usable when Workers Builds deploys before D1 migrations.
// CREATE IF NOT EXISTS leaves all existing recipes and revisions untouched.
const schema=`CREATE TABLE IF NOT EXISTS user_data (
  user_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('recipe','shopping')),
  id TEXT NOT NULL,
  data TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  edit_id TEXT NOT NULL,
  deleted INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(user_id, kind, id)
)`;
const ready=new WeakMap<D1Database,Promise<void>>();
export function ensureDataSchema(db:D1Database):Promise<void>{
  const existing=ready.get(db);if(existing)return existing;
  const initialization=db.prepare(schema).run().then(()=>{}).catch(error=>{ready.delete(db);throw error;});
  ready.set(db,initialization);return initialization;
}
