-- Short-lived "who is shopping now" heartbeats between members of a book.
CREATE TABLE IF NOT EXISTS recipe_space_presence (
 space_id TEXT NOT NULL, user_id TEXT NOT NULL, activity TEXT NOT NULL,
 updated_at INTEGER NOT NULL, PRIMARY KEY(space_id,user_id)
);
