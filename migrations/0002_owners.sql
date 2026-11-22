-- Notes become multi-user. Every note and folder belongs to an owner: a user id
-- from the shared audrey-rocks users table. Notes from before this belong to the
-- dev account, whose id is 'owner'. SQLite can't change a primary key in place,
-- so both tables are rebuilt.
CREATE TABLE notes_new (
	owner TEXT NOT NULL,
	path TEXT NOT NULL,
	content TEXT NOT NULL DEFAULT '',
	version INTEGER NOT NULL DEFAULT 1,
	created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	PRIMARY KEY (owner, path)
);
INSERT INTO notes_new (owner, path, content, version, created_at, updated_at)
	SELECT 'owner', path, content, version, created_at, updated_at FROM notes;
DROP TABLE notes;
ALTER TABLE notes_new RENAME TO notes;

CREATE TABLE folders_new (
	owner TEXT NOT NULL,
	path TEXT NOT NULL,
	PRIMARY KEY (owner, path)
);
INSERT INTO folders_new (owner, path) SELECT 'owner', path FROM folders;
DROP TABLE folders;
ALTER TABLE folders_new RENAME TO folders;
