import { scopeFor } from "./auth";
import * as notes from "./notes";
import { UserError } from "./notes";
import { limitMessage, limitOf, spend, usedToday, type User } from "./rocks-users";

// JSON API for the web page. Same logic as the MCP tools.

function json(value: unknown, status = 200) {
	return Response.json(value, { status, headers: { "Cache-Control": "no-store" } });
}

async function body<T>(request: Request): Promise<T> {
	try {
		return (await request.json()) as T;
	} catch {
		throw new UserError("Request body isn't valid JSON.");
	}
}

const WRITES = new Set(["PUT /notes/api/note", "POST /notes/api/folder", "POST /notes/api/move", "POST /notes/api/delete"]);

async function route(request: Request, env: Env, url: URL, user: User): Promise<Response> {
	const { pathname: path, searchParams: q } = url;
	const method = request.method;
	const s = scopeFor(env, user);

	if (WRITES.has(`${method} ${path}`)) {
		const spent = await spend(env.USERS, user, "note_write");
		if (!spent.ok) return json({ error: limitMessage(spent, "saving notes") }, 429);
	}

	if (path === "/notes/api/me" && method === "GET") {
		const limit = limitOf(user.role, "note_write");
		const left = Number.isFinite(limit) ? Math.max(0, limit - (await usedToday(env.USERS, user.id, "note_write"))) : null;
		return json({ email: user.email, role: user.role, writes_left: left });
	}
	if (path === "/notes/api/tree" && method === "GET") return json(await notes.list(s));
	if (path === "/notes/api/note" && method === "GET") return json(await notes.read(s, q.get("path") ?? ""));
	if (path === "/notes/api/note" && method === "PUT") return json(await notes.write(s, await body(request)));
	if (path === "/notes/api/folder" && method === "POST") {
		return json(await notes.createFolder(s, (await body<{ path: string }>(request)).path));
	}
	if (path === "/notes/api/move" && method === "POST") return json(await notes.move(s, await body(request)));
	if (path === "/notes/api/delete" && method === "POST") return json(await notes.remove(s, await body(request)));
	if (path === "/notes/api/search" && method === "GET") {
		return json({ results: await notes.search(s, { query: q.get("q") ?? "", limit: 50 }) });
	}

	return json({ error: "Not found" }, 404);
}

export async function handleApi(request: Request, env: Env, url: URL, user: User) {
	// The page only ever calls its own API. Refuse cross-site writes.
	if (request.method !== "GET" && request.headers.get("Sec-Fetch-Site") === "cross-site") {
		return json({ error: "Cross-site request refused." }, 403);
	}
	try {
		return await route(request, env, url, user);
	} catch (err) {
		if (err instanceof UserError) return json({ error: err.message }, 400);
		throw err;
	}
}
