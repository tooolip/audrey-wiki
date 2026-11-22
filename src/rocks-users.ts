// Roles, limits and daily counters for audrey.rocks apps.
//
// The source of truth is ~/Code/audrey-rocks/shared/rocks-users.ts. Each app
// keeps a copy (they're separate repos); change it there and copy it over.
//
// The audrey-rocks gateway signs people in (Cloudflare Access with Google),
// keeps the users table and adds these headers to every request it forwards to
// an app. The apps have no hostname of their own, so only the gateway can set them:
//   x-rocks-user   the user's id ('owner' for the dev account)
//   x-rocks-role   dev | basic | new
//   x-rocks-email  the email Access signed in

export type Role = "dev" | "basic" | "new";
export type User = { id: string; role: Role; email: string };

// Basic accounts are "new" for their first week, with smaller limits.
export const NEW_FOR_MS = 7 * 24 * 3600_000;

// Per user, per UTC day. Dev has no app limits.
export const LIMITS = {
	basic: { x_lookup: 25, x_download: 10, note_write: 300, notes: 300, note_bytes: 5_000_000 },
	new: { x_lookup: 10, x_download: 5, note_write: 100, notes: 50, note_bytes: 1_000_000 },
} as const;
export type Metric = "x_lookup" | "x_download" | "note_write";

// All basic and new users together, per UTC day. Past this they get
// "busy today" while dev keeps working. Sized well under the Workers Free
// plan (100k D1 rows written per day), so most of it is always left for dev.
export const BASIC_CEILING: Record<Metric, number> = { x_lookup: 1500, x_download: 500, note_write: 10_000 };

export function today(now = Date.now()) {
	return new Date(now).toISOString().slice(0, 10);
}

export function userFrom(request: Request): User | null {
	const id = request.headers.get("x-rocks-user");
	const role = request.headers.get("x-rocks-role");
	const email = request.headers.get("x-rocks-email");
	if (!id || !email || (role !== "dev" && role !== "basic" && role !== "new")) return null;
	return { id, role, email };
}

export function limitOf(role: Role, metric: keyof (typeof LIMITS)["basic"]) {
	return role === "dev" ? Infinity : LIMITS[role][metric];
}

export type Spend = { ok: true; used: number; limit: number } | { ok: false; used: number; limit: number; reason: "user" | "everyone" };

// Counts `by` uses of a metric and says whether it was allowed. The increment
// only happens when it stays within the limit, so a refused action isn't counted.
export async function spend(db: D1Database, user: User, metric: Metric, by = 1, now = Date.now()): Promise<Spend> {
	const day = today(now);
	const limit = limitOf(user.role, metric);
	if (user.role !== "dev") {
		const all = await db
			.prepare("SELECT COALESCE(SUM(n), 0) AS n FROM usage WHERE day = ?1 AND metric = ?2 AND user_id != 'owner'")
			.bind(day, metric)
			.first<{ n: number }>();
		if ((all?.n ?? 0) + by > BASIC_CEILING[metric]) return { ok: false, used: 0, limit, reason: "everyone" };
	}
	const cap = Number.isFinite(limit) ? limit : Number.MAX_SAFE_INTEGER;
	const row = await db
		.prepare(
			`INSERT INTO usage (user_id, day, metric, n) SELECT ?1, ?2, ?3, ?4 WHERE ?4 <= ?5
			 ON CONFLICT (user_id, day, metric) DO UPDATE SET n = n + excluded.n WHERE usage.n + excluded.n <= ?5
			 RETURNING n`,
		)
		.bind(user.id, day, metric, by, cap)
		.first<{ n: number }>();
	if (row) return { ok: true, used: row.n, limit };
	const used = await usedToday(db, user.id, metric, now);
	return { ok: false, used, limit, reason: "user" };
}

export async function usedToday(db: D1Database, userId: string, metric: Metric, now = Date.now()) {
	const row = await db
		.prepare("SELECT n FROM usage WHERE user_id = ?1 AND day = ?2 AND metric = ?3")
		.bind(userId, today(now), metric)
		.first<{ n: number }>();
	return row?.n ?? 0;
}

export function limitMessage(s: Extract<Spend, { ok: false }>, what: string) {
	return s.reason === "everyone"
		? `Too many people used ${what} today. It opens again after midnight UTC.`
		: `That's today's limit for ${what} (${s.limit}). It resets at midnight UTC.`;
}
