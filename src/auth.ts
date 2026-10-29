import { createRemoteJWKSet, jwtVerify } from "jose";

let jwks: ReturnType<typeof createRemoteJWKSet> | undefined;

// Cloudflare Access sits in front of the site and signs a JWT for each request
// it lets through. Checking it here as well means a gap in the Access setup
// can't expose anything: only the owner's email gets an answer.
export async function ownerEmail(request: Request, env: Env): Promise<string | null> {
	// Local dev has no Access in front. Vite drops this branch from production builds.
	if (import.meta.env.DEV) return env.OWNER_EMAIL;

	const token = request.headers.get("Cf-Access-Jwt-Assertion");
	if (!token) return null;
	jwks ??= createRemoteJWKSet(new URL(`${env.ACCESS_TEAM_DOMAIN}/cdn-cgi/access/certs`));
	try {
		const { payload } = await jwtVerify(token, jwks, {
			issuer: env.ACCESS_TEAM_DOMAIN,
			audience: env.ACCESS_AUD,
		});
		const email = typeof payload.email === "string" ? payload.email.toLowerCase() : "";
		return email === env.OWNER_EMAIL.toLowerCase() ? email : null;
	} catch {
		return null;
	}
}
