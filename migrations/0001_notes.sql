-- Notes are markdown addressed by path, like "Projects/Wiki ideas". Folders are
-- implied by paths; the folders table also keeps ones that are empty.
CREATE TABLE notes (
	path TEXT PRIMARY KEY,
	content TEXT NOT NULL DEFAULT '',
	version INTEGER NOT NULL DEFAULT 1,
	created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE folders (
	path TEXT PRIMARY KEY
);
