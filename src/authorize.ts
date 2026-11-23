import { AuthorizationError, CimdFetchError, type ConsentDescription } from "@cloudflare/workers-oauth-provider";
import type { User } from "./rocks-users";

// /authorize is where an MCP client (Claude Code, claude.ai) asks for a token.
// Access has already signed the person in by the time this runs, so all that's
// left is asking whether this app may use their notes. Agents are dev-only for
// now: OAuth tokens live in KV, and the free plan allows 1,000 KV writes a day.

const escape = (value: string) => value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

const SECURITY = {
	"Content-Security-Policy": "default-src 'none'; style-src 'self'; font-src 'self'; img-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
	"X-Content-Type-Options": "nosniff",
	"Referrer-Policy": "no-referrer",
	"Cache-Control": "no-store",
};

function page(title: string, body: string) {
	return `<!doctype html>
<html lang="en">
<head>
	<meta charset="utf-8">
	<meta name="viewport" content="width=device-width, initial-scale=1">
	<meta name="theme-color" content="#f6f3ec">
	<title>${title} · audrey.rocks</title>
	<link rel="stylesheet" href="/_theme/theme.css">
	<link rel="stylesheet" href="/notes/app.css?v=3">
	<link rel="icon" href="/favicon.svg" type="image/svg+xml">
</head>
<body>
<main class="consent">${body}</main>
</body>
</html>`;
}

function consentPage(details: ConsentDescription, handle: string) {
	const name = escape(details.clientName);
	const origin = details.clientDomain
		? `Published by <strong>${escape(details.clientDomain)}</strong>.`
		: "This app registered itself, so its name isn't verified.";
	const local = details.redirectIsLoopback
		? "<p><strong>This sends access to an app on your computer.</strong> Continue only if you just started connecting from it.</p>"
		: "";
	return page(
		`Connect ${name}?`,
		`<h1>Let ${name} use your notes?</h1>
<p>${origin} Access goes to <strong>${escape(details.redirectHost)}</strong>.</p>
${local}
<p>It will be able to read, write, move and delete notes.</p>
<form method="post">
	<input type="hidden" name="handle" value="${escape(handle)}">
	<button class="btn accent" name="decision" value="approve">Allow</button>
	<button class="btn" name="decision" value="deny">Deny</button>
</form>`,
	);
}

function problem(message: string) {
	return new Response(page("Couldn't connect", `<h1>Couldn't connect</h1><p>${escape(message)}</p>`), {
		status: 400,
		headers: { "Content-Type": "text/html; charset=utf-8", ...SECURITY },
	});
}

export async function authorize(request: Request, env: Env, user: User) {
	const oauth = env.OAUTH_PROVIDER;
	if (user.role !== "dev") return problem("Connecting agents isn't open to everyone yet. You can still use your notes in the browser.");
	try {
		if (request.method === "GET") {
			const authRequest = await oauth.parseAuthRequest(request);
			const details = await oauth.describeConsent(authRequest);
			const consent = await oauth.beginConsent(authRequest);
			consent.headers.set("Content-Type", "text/html; charset=utf-8");
			for (const [k, v] of Object.entries(SECURITY)) consent.headers.set(k, v);
			return new Response(consentPage(details, consent.handle), { headers: consent.headers });
		}
		if (request.method === "POST") {
			const form = await request.formData();
			const handle = String(form.get("handle") ?? "");
			if (form.get("decision") !== "approve") {
				const denied = await oauth.denyConsent(request, handle);
				return new Response(null, { status: 302, headers: denied.headers });
			}
			const approved = await oauth.approveConsent(request, handle);
			const { redirectTo } = await oauth.completeAuthorization({
				request: approved.request,
				userId: user.id,
				metadata: {},
				scope: approved.request.scope,
				props: { userId: user.id, email: user.email },
			});
			approved.headers.set("Location", redirectTo);
			return new Response(null, { status: 302, headers: approved.headers });
		}
		return new Response("Method not allowed", { status: 405 });
	} catch (err) {
		if (err instanceof AuthorizationError && err.redirectTo) return Response.redirect(err.redirectTo, 302);
		if (err instanceof AuthorizationError) return problem(err.description);
		if (err instanceof CimdFetchError) return problem("This app couldn't be verified.");
		throw err;
	}
}
