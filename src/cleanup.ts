import { removeOwner } from "./notes";
import { LIMITS, NEW_FOR_MS, type Metric, today } from "./rocks-users";

// Runs once a day. Notes is the one app with both the users table and people's
// data, so the account housekeeping for all of audrey.rocks lives here:
//
// - suspend basic accounts that hit a daily limit three days running
// - pause new sign-ups if more than SIGNUP_BURST arrive in a day
// - flag (never auto-suspend) accounts whose recent notes look like spam
// - delete basic accounts inactive for INACTIVE_DAYS, and suspended ones after
//   SUSPENDED_DAYS, with all their notes. Access frees their seat on its own
//   after 30 days without a sign-in.
//
// Dev ('owner') is never touched. A summary goes in settings.last_cleanup for
// the admin page.

const DAY = 24 * 3600_000;
const INACTIVE_DAYS = 30;
const SUSPENDED_DAYS = 14;
const SIGNUP_BURST = 10;

type UserRow = { id: string; created_at: number; last_seen: number; status: string; suspended_at: number | null; flags: string };

function addFlag(flags: string, flag: string) {
	const set = new Set(flags.split(",").filter(Boolean));
	set.add(flag);
	return [...set].join(",");
}

export async function cleanup(env: Env, now = Date.now()) {
	const users = env.USERS;
	const summary = { suspended: [] as string[], flagged: [] as string[], deleted: [] as string[], signups_paused: false };

	const all = (await users.prepare("SELECT id, created_at, last_seen, status, suspended_at, flags FROM users WHERE id != 'owner'").all<UserRow>())
		.results;

	// 1. At a daily limit on each of the last three days.
	const days = [1, 2, 3].map((d) => today(now - d * DAY));
	const usage = (
		await users
			.prepare(`SELECT user_id, day, metric, n FROM usage WHERE user_id != 'owner' AND day IN (?1, ?2, ?3)`)
			.bind(...days)
			.all<{ user_id: string; day: string; metric: Metric; n: number }>()
	).results;
	for (const u of all.filter((u) => u.status === "active")) {
		const capped = days.every((day) => {
			const role = Date.parse(`${day}T00:00:00Z`) - u.created_at < NEW_FOR_MS ? "new" : "basic";
			return usage.some((r) => r.user_id === u.id && r.day === day && r.n >= LIMITS[role][r.metric]);
		});
		if (capped) {
			await users
				.prepare("UPDATE users SET status = 'suspended', suspended_at = ?1, flags = ?2 WHERE id = ?3")
				.bind(now, addFlag(u.flags, "at-limit-3-days"), u.id)
				.run();
			summary.suspended.push(u.id);
		}
	}

	// 2. A burst of sign-ups usually means a script. Pause until dev looks.
	const recent = all.filter((u) => now - u.created_at < DAY).length;
	if (recent > SIGNUP_BURST) {
		await users
			.prepare("INSERT INTO settings (key, value, updated_at) VALUES ('signups_paused', '1', ?1) ON CONFLICT (key) DO UPDATE SET value = '1', updated_at = ?1")
			.bind(now)
			.run();
		summary.signups_paused = true;
	}

	// 3. Recently changed notes that are mostly links, or many copies of one note.
	const changed = (
		await env.DB.prepare(
			"SELECT owner, content FROM notes WHERE owner != 'owner' AND updated_at >= ?1",
		)
			.bind(new Date(now - DAY).toISOString())
			.all<{ owner: string; content: string }>()
	).results;
	const byOwner = new Map<string, string[]>();
	for (const n of changed) byOwner.set(n.owner, [...(byOwner.get(n.owner) ?? []), n.content]);
	for (const [owner, contents] of byOwner) {
		const linky = contents.filter((c) => {
			const links = c.match(/https?:\/\/\S+/g) ?? [];
			const linkChars = links.reduce((a, l) => a + l.length, 0);
			return links.length >= 10 && linkChars > c.length * 0.5;
		}).length;
		const copies = Math.max(0, ...[...contents.reduce((m, c) => m.set(c, (m.get(c) ?? 0) + 1), new Map<string, number>()).values()]);
		const flags: string[] = [];
		if (linky >= 3) flags.push("links");
		if (copies >= 10) flags.push("copies");
		const u = all.find((x) => x.id === owner);
		if (u && flags.length) {
			await users.prepare("UPDATE users SET flags = ?1 WHERE id = ?2").bind(flags.reduce(addFlag, u.flags), owner).run();
			summary.flagged.push(owner);
		}
	}

	// 4. Prune.
	const prune = all.filter(
		(u) =>
			(u.status === "active" && now - u.last_seen > INACTIVE_DAYS * DAY) ||
			(u.status === "suspended" && u.suspended_at !== null && now - u.suspended_at > SUSPENDED_DAYS * DAY),
	);
	for (const u of prune) {
		await deleteAccount(env, u.id);
		summary.deleted.push(u.id);
	}

	// 5. Old counters are only noise.
	await users.prepare("DELETE FROM usage WHERE day < ?1").bind(today(now - 35 * DAY)).run();

	await users
		.prepare(
			"INSERT INTO settings (key, value, updated_at) VALUES ('last_cleanup', ?1, ?2) ON CONFLICT (key) DO UPDATE SET value = ?1, updated_at = ?2",
		)
		.bind(JSON.stringify(summary), now)
		.run();
	console.log("cleanup", JSON.stringify({ ...summary, users: all.length }));
	return summary;
}

// An account and everything in it. Never the dev account.
export async function deleteAccount(env: Env, id: string) {
	if (id === "owner") throw new Error("The dev account can't be deleted.");
	await removeOwner(env.DB, id);
	await env.USERS.batch([
		env.USERS.prepare("DELETE FROM usage WHERE user_id = ?1").bind(id),
		env.USERS.prepare("DELETE FROM users WHERE id = ?1").bind(id),
	]);
}
