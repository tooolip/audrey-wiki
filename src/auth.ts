import { createRemoteJWKSet, jwtVerify } from "jose";
import { LIMITS, type User, userFrom } from "./rocks-users";
import type { Scope } from "./notes";

let jwks: ReturnType<typeof createRemoteJWKSet> | undefined;

// The audrey-rocks gateway signs people in with Cloudflare Access (Google) and
// forwards the request here with the user in x-rocks-* headers. This Worker has
// no hostname, so only the gateway can reach it. It still checks the Access JWT
// itself and that it names the same person, so a gap in the Access or gateway
// setup can't expose anyone's notes.
export async function currentUser(request: Request, env: Env): Promise<User | null> {
	// Local dev has no Access or gateway in front. Vite drops this branch from production builds.
	if (import.meta.env.DEV) return { id: "owner", role: "dev", email: "dev@localhost" };

	const user = userFrom(request);
	const token = request.headers.get("Cf-Access-Jwt-Assertion");
	if (!user || !token) return null;
	jwks ??= createRemoteJWKSet(new URL(`${env.ACCESS_TEAM_DOMAIN}/cdn-cgi/access/certs`));
	try {
		const { payload } = await jwtVerify(token, jwks, {
			issuer: env.ACCESS_TEAM_DOMAIN,
			audience: env.ACCESS_AUD,
		});
		const email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
		return email && email === user.email ? user : null;
	} catch {
		return null;
	}
}

// The notes this user can see, with a basic account's storage caps.
export function scopeFor(env: Env, user: Pick<User, "id" | "role">): Scope {
	if (user.role === "dev") return { db: env.DB, owner: user.id };
	const caps = LIMITS[user.role];
	return { db: env.DB, owner: user.id, caps: { notes: caps.notes, bytes: caps.note_bytes, note: 100_000 } };
}
