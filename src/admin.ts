import { deleteAccount } from "./cleanup";
import { NEW_FOR_MS, type User, today } from "./rocks-users";

// audrey.rocks/notes/admin: every account, what it's used, and buttons to
// suspend, restore or delete it. Dev only. Plain HTML forms, no scripts.

const DAY = 24 * 3600_000;
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const ago = (t: number, now: number) => {
	const d = Math.floor((now - t) / DAY);
	return d < 1 ? "today" : d === 1 ? "yesterday" : `${d}d ago`;
};

type Row = { id: string; email: string; status: string; flags: string; created_at: number; last_seen: number };

function button(action: string, id: string, label: string, cls = "") {
	return `<form method="post" class="inline"><input type="hidden" name="action" value="${action}"><input type="hidden" name="id" value="${esc(id)}"><button class="btn ${cls}" type="submit">${label}</button></form>`;
}

async function render(env: Env, now: number) {
	const [users, usage, settings] = await env.USERS.batch<Record<string, string | number>>([
		env.USERS.prepare("SELECT id, email, status, flags, created_at, last_seen FROM users ORDER BY last_seen DESC LIMIT 200"),
		env.USERS.prepare("SELECT user_id, metric, SUM(n) AS n, SUM(CASE WHEN day = ?1 THEN n ELSE 0 END) AS today FROM usage WHERE day >= ?2 GROUP BY user_id, metric").bind(
			today(now),
			today(now - 6 * DAY),
		),
		env.USERS.prepare("SELECT key, value, updated_at FROM settings"),
	]);
	const notes = (
		await env.DB.prepare("SELECT owner, COUNT(*) AS n, SUM(length(content)) AS size FROM notes GROUP BY owner").all<{ owner: string; n: number; size: number }>()
	).results;
	const setting = (key: string) => settings.results.find((r) => r.key === key);
	const paused = setting("signups_paused")?.value === "1";
	const last = setting("last_cleanup");

	const rows = (users.results as unknown as Row[])
		.map((u) => {
			const role = u.id === "owner" ? "dev" : now - u.created_at < NEW_FOR_MS ? "new" : "basic";
			const n = notes.find((x) => x.owner === u.id);
			const use = usage.results.filter((r) => r.user_id === u.id).map((r) => `${String(r.metric).replace("_", " ")} ${r.today}/${r.n}`);
			const actions =
				u.id === "owner"
					? ""
					: [
							u.status === "suspended" ? button("restore", u.id, "Restore") : button("suspend", u.id, "Suspend"),
							button("delete", u.id, "Delete", "danger"),
						].join("");
			return `<li class="${u.status === "suspended" ? "off" : ""}">
	<span class="who">${esc(u.email)}</span>
	<span class="dim">${role}${u.status === "suspended" ? ` · <span class="berry">suspended</span>` : ""}${u.flags ? ` · <span class="ochre">${esc(u.flags)}</span>` : ""}</span>
	<span class="dim">joined ${ago(u.created_at, now)} · seen ${ago(u.last_seen, now)} · ${n ? `${n.n} notes, ${(n.size / 1000).toFixed(0)} KB` : "no notes"}</span>
	<span class="dim">${use.length ? `today/7d: ${esc(use.join(" · "))}` : "nothing used this week"}</span>
	${actions ? `<span class="acts">${actions}</span>` : ""}
</li>`;
		})
		.join("\n");

	return `<!doctype html>
<html lang="en">
<head>
	<meta charset="utf-8">
	<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
	<meta name="theme-color" content="#f6f3ec">
	<title>accounts · audrey.rocks</title>
	<link rel="stylesheet" href="/_theme/theme.css?v=1">
	<link rel="stylesheet" href="/notes/app.css?v=3">
	<link rel="icon" href="/favicon.svg" type="image/svg+xml">
</head>
<body>
<div class="page">
	<header class="topbar">
		<div class="row">
			<a class="brand" href="/"><span>Audrey Schickler</span></a>
			<span class="crumb-sep" aria-hidden="true">/</span>
			<a href="/notes/">notes</a>
			<span class="crumb-sep" aria-hidden="true">/</span>
			<span>admin</span>
		</div>
		<nav class="topbar-nav"><a href="/notes/">back to notes</a></nav>
	</header>
	<main class="admin-main">
		<h1 class="page-title">Accounts</h1>
		<p class="meta">${users.results.length} accounts · new sign-ups are ${paused ? `<span class="berry">paused</span>` : "open"}.</p>
		<div class="row">${paused ? button("resume_signups", "", "Open sign-ups", "accent") : button("pause_signups", "", "Pause sign-ups")}</div>
		<ul class="accounts">
${rows}
		</ul>
		<p class="meta">Daily cleanup: ${last ? `${ago(Number(last.updated_at), now)}, ${esc(String(last.value))}` : "hasn't run yet"}.</p>
	</main>
	<footer class="foot">
		<span><span class="floret" aria-hidden="true">❀</span> notes admin</span>
		<span class="foot-links"><a href="/notes/">notes</a><a href="/">audrey.rocks</a></span>
	</footer>
</div>
</body>
</html>`;
}

export async function admin(request: Request, env: Env, user: User) {
	if (user.role !== "dev") return new Response("Not found", { status: 404 });
	const now = Date.now();
	if (request.method === "POST") {
		if (request.headers.get("Sec-Fetch-Site") !== "same-origin") return new Response("Cross-site request refused.", { status: 403 });
		const form = await request.formData();
		const action = String(form.get("action") ?? "");
		const id = String(form.get("id") ?? "");
		if (id === "owner") return new Response("The dev account can't be changed here.", { status: 400 });
		if (action === "suspend") await env.USERS.prepare("UPDATE users SET status = 'suspended', suspended_at = ?1 WHERE id = ?2").bind(now, id).run();
		if (action === "restore") await env.USERS.prepare("UPDATE users SET status = 'active', suspended_at = NULL, flags = '' WHERE id = ?1").bind(id).run();
		if (action === "delete") await deleteAccount(env, id);
		if (action === "pause_signups" || action === "resume_signups") {
			const value = action === "pause_signups" ? "1" : "0";
			await env.USERS.prepare(
				"INSERT INTO settings (key, value, updated_at) VALUES ('signups_paused', ?1, ?2) ON CONFLICT (key) DO UPDATE SET value = ?1, updated_at = ?2",
			)
				.bind(value, now)
				.run();
		}
		return new Response(null, { status: 303, headers: { Location: "/notes/admin" } });
	}
	return new Response(await render(env, now), {
		headers: {
			"Content-Type": "text/html; charset=utf-8",
			"Cache-Control": "no-store",
			"Content-Security-Policy": "default-src 'none'; style-src 'self'; font-src 'self'; img-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
			"X-Content-Type-Options": "nosniff",
			"Referrer-Policy": "no-referrer",
		},
	});
}
