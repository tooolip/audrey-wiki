import OAuthProvider from "@cloudflare/workers-oauth-provider";
import { createMcpHandler } from "agents/mcp/server";
import { admin } from "./admin";
import { handleApi } from "./api";
import { currentUser, scopeFor } from "./auth";
import { authorize } from "./authorize";
import { cleanup } from "./cleanup";
import { createServer } from "./mcp";

const ORIGIN = import.meta.env.DEV ? "http://localhost:5195" : import.meta.env.VITE_SITE_ORIGIN;

// Notes live at audrey.rocks/notes. The audrey-rocks gateway forwards /notes/*
// (and the OAuth discovery documents at the site root) here over a service
// binding. The web page (public/, served as static assets under /notes), /notes/api/*,
// /notes/authorize and /notes/admin are behind Cloudflare Access with Google.
// Access lets MCP clients through to /notes/mcp and /notes/oauth/* without a
// login; those use OAuth tokens that only /notes/authorize hands out.
const site: ExportedHandler<Env> = {
	async fetch(request, env) {
		const url = new URL(request.url);
		const path = url.pathname;
		const isApi = path.startsWith("/notes/api/");
		const isAdmin = path === "/notes/admin";
		if (!isApi && !isAdmin && path !== "/notes/authorize") return new Response("Not found", { status: 404 });

		const user = await currentUser(request, env);
		if (!user) return new Response("Forbidden", { status: 403 });
		if (isApi) return handleApi(request, env, url, user);
		if (isAdmin) return admin(request, env, user);
		return authorize(request, env, user);
	},
};

const provider = new OAuthProvider<Env>({
	apiRoute: "/notes/mcp",
	apiHandler: {
		// Only dev can approve an agent so far; tokens from before notes moved
		// carry no userId and belong to the dev account too.
		fetch: (request, env, ctx) => {
			const owner = (ctx.props as { userId?: string } | undefined)?.userId ?? "owner";
			return createMcpHandler(() => createServer(scopeFor(env, { id: owner, role: "dev" })))(request, env, ctx);
		},
	},
	defaultHandler: site,
	authorizeEndpoint: "/notes/authorize",
	tokenEndpoint: "/notes/oauth/token",
	clientRegistrationEndpoint: "/notes/oauth/register",
	clientIdMetadataDocumentEnabled: true,
	scopesSupported: ["notes"],
	resourceMetadata: {
		resource: `${ORIGIN}/notes/mcp`,
		authorization_servers: [ORIGIN],
		resource_name: "audrey.rocks notes",
	},
});

export default {
	fetch: (request, env, ctx) => provider.fetch(request, env, ctx),
	// Daily: suspend and prune spam and inactive accounts (src/cleanup.ts).
	async scheduled(controller, env, ctx) {
		ctx.waitUntil(cleanup(env, controller.scheduledTime));
	},
} satisfies ExportedHandler<Env>;
