import {ensureDataSchema} from './data-schema';
import {profileSchema} from './profile';
const schema="CREATE TABLE IF NOT EXISTS recipe_space_presence (\n space_id TEXT NOT NULL, user_id TEXT NOT NULL, activity TEXT NOT NULL,\n updated_at INTEGER NOT NULL, PRIMARY KEY(space_id,user_id)\n);\nCREATE TABLE IF NOT EXISTS recipe_spaces (\n id TEXT PRIMARY KEY, name TEXT NOT NULL, owner_id TEXT NOT NULL,\n data_owner TEXT NOT NULL UNIQUE, photo_owner TEXT NOT NULL UNIQUE,\n is_home INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,\n deleted_at TEXT\n);\nCREATE TABLE IF NOT EXISTS recipe_space_members (\n space_id TEXT NOT NULL, user_id TEXT NOT NULL, name TEXT NOT NULL DEFAULT '',\n active INTEGER NOT NULL DEFAULT 1, joined_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,\n PRIMARY KEY(space_id,user_id)\n);\nCREATE INDEX IF NOT EXISTS recipe_members_user ON recipe_space_members(user_id,active);\nCREATE TABLE IF NOT EXISTS recipe_space_invites (\n code_hash TEXT PRIMARY KEY, space_id TEXT NOT NULL, created_by TEXT NOT NULL,\n expires_at INTEGER NOT NULL, consumed_by TEXT, revoked INTEGER NOT NULL DEFAULT 0\n);\nCREATE TABLE IF NOT EXISTS recipe_invite_attempts (\n user_id TEXT PRIMARY KEY, window INTEGER NOT NULL, attempts INTEGER NOT NULL\n);";
const ready=new WeakMap<D1Database,Promise<void>>();
export function ensureSpaceSchema(db:D1Database):Promise<void>{
 const current=ready.get(db);if(current)return current;
 const task=(async()=>{await ensureDataSchema(db);await db.prepare(profileSchema).run();for(const sql of schema.split(';').filter(s=>s.trim()))await db.prepare(sql).run();})().catch(error=>{ready.delete(db);throw error;});
 ready.set(db,task);return task;
}
