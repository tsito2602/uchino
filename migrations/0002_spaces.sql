-- Existing user_data.user_id is retained as an opaque data namespace. A home
-- space claims only its owner's namespace; new spaces receive fresh namespaces.
CREATE TABLE IF NOT EXISTS recipe_spaces (
 id TEXT PRIMARY KEY, name TEXT NOT NULL, owner_id TEXT NOT NULL,
 data_owner TEXT NOT NULL UNIQUE, photo_owner TEXT NOT NULL UNIQUE,
 is_home INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 deleted_at TEXT
);
CREATE TABLE IF NOT EXISTS recipe_space_members (
 space_id TEXT NOT NULL, user_id TEXT NOT NULL, name TEXT NOT NULL DEFAULT '',
 active INTEGER NOT NULL DEFAULT 1, joined_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(space_id,user_id)
);
CREATE INDEX IF NOT EXISTS recipe_members_user ON recipe_space_members(user_id,active);
CREATE TABLE IF NOT EXISTS recipe_space_invites (
 code_hash TEXT PRIMARY KEY, space_id TEXT NOT NULL, created_by TEXT NOT NULL,
 expires_at INTEGER NOT NULL, consumed_by TEXT, revoked INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS recipe_invite_attempts (
 user_id TEXT PRIMARY KEY, window INTEGER NOT NULL, attempts INTEGER NOT NULL
);
