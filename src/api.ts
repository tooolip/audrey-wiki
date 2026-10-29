import * as notes from "./notes";
import { UserError } from "./notes";

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

async function route(request: Request, env: Env, url: URL, me: string): Promise<Response> {
	const { pathname: path, searchParams: q } = url;
	const method = request.method;

	if (path === "/api/me" && method === "GET") return json({ email: me });
	if (path === "/api/tree" && method === "GET") return json(await notes.list(env));
	if (path === "/api/note" && method === "GET") return json(await notes.read(env, q.get("path") ?? ""));
	if (path === "/api/note" && method === "PUT") return json(await notes.write(env, await body(request)));
	if (path === "/api/folder" && method === "POST") {
		return json(await notes.createFolder(env, (await body<{ path: string }>(request)).path));
	}
	if (path === "/api/move" && method === "POST") return json(await notes.move(env, await body(request)));
	if (path === "/api/delete" && method === "POST") return json(await notes.remove(env, await body(request)));
	if (path === "/api/search" && method === "GET") {
		return json({ results: await notes.search(env, { query: q.get("q") ?? "", limit: 50 }) });
	}

	return json({ error: "Not found" }, 404);
}

export async function handleApi(request: Request, env: Env, url: URL, me: string) {
	// The page only ever calls its own API. Refuse cross-site writes.
	if (request.method !== "GET" && request.headers.get("Sec-Fetch-Site") === "cross-site") {
		return json({ error: "Cross-site request refused." }, 403);
	}
	try {
		return await route(request, env, url, me);
	} catch (err) {
		if (err instanceof UserError) return json({ error: err.message }, 400);
		throw err;
	}
}
