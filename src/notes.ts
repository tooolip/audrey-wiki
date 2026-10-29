// Notes are markdown addressed by path, like "Projects/Wiki ideas". A folder is
// any path prefix, plus the rows in `folders` so empty ones stick around.
// There are only ever a few thousand notes, so loading every path when a move
// or delete needs the whole picture is fine.

export const MAX_NOTE = 500_000;
const MAX_SEGMENT = 120;

// Bad input from a caller. The message is safe to show them.
export class UserError extends Error {}

export type NoteMeta = { path: string; size: number; version: number; updated_at: string };
export type Note = NoteMeta & { content: string; created_at: string };

const now = "strftime('%Y-%m-%dT%H:%M:%fZ', 'now')";

export function normalizePath(path: string) {
	const parts = path
		.split("/")
		.map((p) => p.trim())
		.filter(Boolean);
	if (!parts.length) throw new UserError("Path is empty.");
	for (const part of parts) {
		if (part === "." || part === "..") throw new UserError(`"${part}" isn't allowed in a path.`);
		if (part.length > MAX_SEGMENT) throw new UserError(`Names are capped at ${MAX_SEGMENT} characters.`);
		// oxlint-disable-next-line no-control-regex
		if (/[\u0000-\u001f\u007f]/.test(part)) throw new UserError("Paths can't contain control characters.");
	}
	return parts.join("/");
}

function parentsOf(path: string) {
	const parts = path.split("/");
	return parts.slice(0, -1).map((_, i) => parts.slice(0, i + 1).join("/"));
}

// LIKE pattern for everything inside a folder.
function inside(folder: string) {
	return folder.replace(/[\\%_]/g, (c) => "\\" + c) + "/%";
}

function isInside(path: string, folder: string) {
	return path.startsWith(folder + "/");
}

function addFolders(env: Env, paths: string[]) {
	return paths.map((p) => env.DB.prepare("INSERT OR IGNORE INTO folders (path) VALUES (?)").bind(p));
}

async function allPaths(env: Env) {
	const [notes, folders] = await env.DB.batch<{ path: string }>([
		env.DB.prepare("SELECT path FROM notes"),
		env.DB.prepare("SELECT path FROM folders"),
	]);
	const noteSet = new Set(notes.results.map((r) => r.path));
	const folderSet = new Set(folders.results.map((r) => r.path));
	for (const p of noteSet) for (const parent of parentsOf(p)) folderSet.add(parent);
	return { notes: noteSet, folders: folderSet };
}

export async function list(env: Env, args: { folder?: string; recursive?: boolean } = {}) {
	const folder = args.folder ? normalizePath(args.folder) : "";
	const recursive = args.recursive ?? true;
	const where = folder ? "WHERE path LIKE ? ESCAPE '\\'" : "";
	const binds = folder ? [inside(folder)] : [];
	const [notes, folders] = await env.DB.batch([
		env.DB.prepare(
			`SELECT path, length(content) AS size, version, updated_at FROM notes ${where} ORDER BY path COLLATE NOCASE`,
		).bind(...binds),
		env.DB.prepare(`SELECT path FROM folders ${where}`).bind(...binds),
	]);
	const depth = folder ? folder.split("/").length + 1 : 1;
	const shallow = (p: string) => recursive || p.split("/").length === depth;
	const folderSet = new Set((folders.results as { path: string }[]).map((r) => r.path));
	for (const n of notes.results as NoteMeta[]) {
		for (const parent of parentsOf(n.path)) if (!folder || isInside(parent, folder)) folderSet.add(parent);
	}
	return {
		folder,
		folders: [...folderSet].filter(shallow).sort((a, b) => a.localeCompare(b)),
		notes: (notes.results as NoteMeta[]).filter((n) => shallow(n.path)),
	};
}

export async function read(env: Env, path: string) {
	path = normalizePath(path);
	const note = await env.DB.prepare(
		"SELECT path, content, length(content) AS size, version, created_at, updated_at FROM notes WHERE path = ?",
	)
		.bind(path)
		.first<Note>();
	if (!note) throw new UserError(`No note at ${path}.`);
	return note;
}

export async function readMany(env: Env, paths: string[]) {
	const found = new Map<string, Note>();
	const normalized = paths.map(normalizePath);
	// D1 caps bound parameters per query, so go in chunks.
	for (let i = 0; i < normalized.length; i += 50) {
		const chunk = normalized.slice(i, i + 50);
		const { results } = await env.DB.prepare(
			`SELECT path, content, length(content) AS size, version, created_at, updated_at FROM notes WHERE path IN (${chunk.map(() => "?").join(",")})`,
		)
			.bind(...chunk)
			.all<Note>();
		for (const n of results) found.set(n.path, n);
	}
	return normalized.map((path) => found.get(path) ?? { path, error: `No note at ${path}.` });
}

export type WriteMode = "replace" | "append" | "prepend";

// Creates the note (and its folders) or updates it. With if_version, the write
// only happens if nobody changed the note since that version.
export async function write(
	env: Env,
	args: { path: string; content: string; mode?: WriteMode; if_version?: number },
) {
	const path = normalizePath(args.path);
	const mode = args.mode ?? "replace";
	const merged =
		mode === "append"
			? "CASE WHEN notes.content = '' THEN excluded.content ELSE notes.content || char(10) || excluded.content END"
			: mode === "prepend"
				? "CASE WHEN notes.content = '' THEN excluded.content ELSE excluded.content || char(10) || notes.content END"
				: "excluded.content";
	const guard = args.if_version === undefined ? "" : "WHERE notes.version = ?";
	const upsert = env.DB.prepare(
		`INSERT INTO notes (path, content) VALUES (?, ?)
		ON CONFLICT (path) DO UPDATE SET content = ${merged}, version = notes.version + 1, updated_at = ${now} ${guard}
		RETURNING version, length(content) AS size, updated_at`,
	).bind(path, args.content, ...(args.if_version === undefined ? [] : [args.if_version]));

	const current = await env.DB.prepare("SELECT version, length(content) AS size FROM notes WHERE path = ?")
		.bind(path)
		.first<{ version: number; size: number }>();
	if (args.if_version !== undefined) {
		if (!current) throw new UserError(`No note at ${path}. Leave out if_version to create it.`);
		if (current.version !== args.if_version) {
			throw new UserError(
				`${path} changed since version ${args.if_version} (it's at version ${current.version} now). Read it again and redo your change.`,
			);
		}
	}
	const size = mode === "replace" || !current ? args.content.length : current.size + 1 + args.content.length;
	if (size > MAX_NOTE) throw new UserError(`Notes are capped at ${MAX_NOTE} characters.`);

	const results = await env.DB.batch([...addFolders(env, parentsOf(path)), upsert]);
	const row = results.at(-1)!.results[0] as
		| { version: number; size: number; updated_at: string }
		| undefined;
	// The guard can still lose a race between the check above and the batch.
	if (!row) throw new UserError(`${path} changed while saving. Read it again and redo your change.`);
	return { path, created: row.version === 1, version: row.version, size: row.size, updated_at: row.updated_at };
}

// Swaps exact text, like a find-and-replace. Cheaper for agents than sending
// back a whole note to change a line.
export async function edit(
	env: Env,
	args: { path: string; old_text: string; new_text: string; replace_all?: boolean },
) {
	if (!args.old_text) throw new UserError("old_text is empty.");
	const note = await read(env, args.path);
	const count = note.content.split(args.old_text).length - 1;
	if (count === 0) throw new UserError(`old_text wasn't found in ${note.path}.`);
	if (count > 1 && !args.replace_all) {
		throw new UserError(
			`old_text appears ${count} times in ${note.path}. Include more surrounding text, or pass replace_all.`,
		);
	}
	const content = args.replace_all
		? note.content.split(args.old_text).join(args.new_text)
		: note.content.replace(args.old_text, () => args.new_text);
	const saved = await write(env, { path: note.path, content, if_version: note.version });
	return { ...saved, replaced: args.replace_all ? count : 1 };
}

export async function createFolder(env: Env, path: string) {
	path = normalizePath(path);
	await env.DB.batch(addFolders(env, [...parentsOf(path), path]));
	return { folder: path };
}

// Moves or renames a note, a folder (with everything in it), or both if a note
// and a folder share the path.
export async function move(env: Env, args: { from: string; to: string }) {
	const from = normalizePath(args.from);
	const to = normalizePath(args.to);
	if (from === to) return { from, to, moved: 0 };
	const { notes, folders } = await allPaths(env);
	const isNote = notes.has(from);
	const isFolder = folders.has(from);
	if (!isNote && !isFolder) throw new UserError(`Nothing at ${from}.`);
	if (isFolder && isInside(to, from)) throw new UserError("A folder can't be moved inside itself.");

	const rename = (p: string) => (p === from ? to : to + p.slice(from.length));
	const movingNotes = [...notes].filter((p) => (isNote && p === from) || (isFolder && isInside(p, from)));
	for (const p of movingNotes) {
		const target = rename(p);
		if (notes.has(target)) throw new UserError(`There's already a note at ${target}.`);
	}

	const statements = [
		...addFolders(env, parentsOf(to)),
		env.DB.prepare(`UPDATE notes SET path = ?, updated_at = ${now} WHERE path = ?`).bind(to, from),
	];
	if (isFolder) {
		statements.push(
			...addFolders(env, [to]),
			env.DB.prepare(
				`UPDATE notes SET path = ? || substr(path, ?), updated_at = ${now} WHERE path LIKE ? ESCAPE '\\'`,
			).bind(to, from.length + 1, inside(from)),
			env.DB.prepare(
				"INSERT OR IGNORE INTO folders (path) SELECT ? || substr(path, ?) FROM folders WHERE path LIKE ? ESCAPE '\\'",
			).bind(to, from.length + 1, inside(from)),
			env.DB.prepare("DELETE FROM folders WHERE path = ? OR path LIKE ? ESCAPE '\\'").bind(from, inside(from)),
		);
	}
	await env.DB.batch(statements);
	return { from, to, moved: movingNotes.length };
}

// Deletes a note, a folder, or both if they share the path. A folder with
// anything in it needs recursive.
export async function remove(env: Env, args: { path: string; recursive?: boolean }) {
	const path = normalizePath(args.path);
	const { notes, folders } = await allPaths(env);
	const isNote = notes.has(path);
	const isFolder = folders.has(path);
	if (!isNote && !isFolder) throw new UserError(`Nothing at ${path}.`);
	const contents = isFolder ? [...notes].filter((p) => isInside(p, path)).length : 0;
	const subfolders = isFolder ? [...folders].filter((p) => isInside(p, path)).length : 0;
	if ((contents || subfolders) && !args.recursive) {
		throw new UserError(
			`${path} has ${contents} note(s) and ${subfolders} folder(s) inside it. Pass recursive to delete them too.`,
		);
	}
	await env.DB.batch([
		env.DB.prepare("DELETE FROM notes WHERE path = ? OR path LIKE ? ESCAPE '\\'").bind(
			isNote ? path : "",
			isFolder ? inside(path) : "",
		),
		env.DB.prepare("DELETE FROM folders WHERE path = ? OR path LIKE ? ESCAPE '\\'").bind(
			isFolder ? path : "",
			isFolder ? inside(path) : "",
		),
	]);
	return { deleted_notes: (isNote ? 1 : 0) + contents, deleted_folders: isFolder ? 1 + subfolders : 0 };
}

// Every word (or "quoted phrase") has to appear somewhere in the note's path or
// text. Returns the matching lines so a caller can tell which notes are worth
// reading in full.
export async function search(env: Env, args: { query: string; folder?: string; limit?: number }) {
	const words = [...args.query.toLowerCase().matchAll(/"([^"]+)"|(\S+)/g)]
		.map((m) => m[1] ?? m[2])
		.filter(Boolean);
	if (!words.length) throw new UserError("Search query is empty.");
	const folder = args.folder ? normalizePath(args.folder) : "";
	const conditions = words.map(() => "(instr(lower(content), ?) > 0 OR instr(lower(path), ?) > 0)");
	if (folder) conditions.push("path LIKE ? ESCAPE '\\'");
	const { results } = await env.DB.prepare(
		`SELECT path, content, updated_at FROM notes WHERE ${conditions.join(" AND ")} ORDER BY updated_at DESC LIMIT ?`,
	)
		.bind(...words.flatMap((w) => [w, w]), ...(folder ? [inside(folder)] : []), args.limit ?? 20)
		.all<{ path: string; content: string; updated_at: string }>();
	return results.map((n) => {
		const lines = n.content.split("\n");
		const matches: { line: number; text: string }[] = [];
		for (let i = 0; i < lines.length && matches.length < 5; i++) {
			const lower = lines[i].toLowerCase();
			if (words.some((w) => lower.includes(w))) {
				matches.push({ line: i + 1, text: lines[i].length > 200 ? lines[i].slice(0, 200) + "…" : lines[i] });
			}
		}
		return { path: n.path, updated_at: n.updated_at, matches };
	});
}
