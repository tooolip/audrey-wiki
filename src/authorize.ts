import { AuthorizationError, CimdFetchError, type ConsentDescription } from "@cloudflare/workers-oauth-provider";

// /authorize is where an MCP client (Claude Code, claude.ai) asks for a token.
// Access has already signed the owner in by the time this runs, so all that's
// left is asking whether this app may use the notes.

const escape = (value: string) => value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function page(title: string, body: string) {
	return `<!doctype html>
<html lang="en">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<link rel="stylesheet" href="/app.css">
<main class="consent">${body}</main>
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
	<button name="decision" value="approve">Allow</button>
	<button name="decision" value="deny" class="secondary">Deny</button>
</form>`,
	);
}

function problem(message: string) {
	return new Response(page("Couldn't connect", `<h1>Couldn't connect</h1><p>${escape(message)}</p>`), {
		status: 400,
		headers: { "Content-Type": "text/html; charset=utf-8" },
	});
}

export async function authorize(request: Request, env: Env, owner: string) {
	const oauth = env.OAUTH_PROVIDER;
	try {
		if (request.method === "GET") {
			const authRequest = await oauth.parseAuthRequest(request);
			const details = await oauth.describeConsent(authRequest);
			const consent = await oauth.beginConsent(authRequest);
			consent.headers.set("Content-Type", "text/html; charset=utf-8");
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
				userId: owner,
				metadata: {},
				scope: approved.request.scope,
				props: { email: owner },
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
