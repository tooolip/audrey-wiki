import OAuthProvider from "@cloudflare/workers-oauth-provider";
import { createMcpHandler } from "agents/mcp/server";
import { handleApi } from "./api";
import { ownerEmail } from "./auth";
import { authorize } from "./authorize";
import { createServer } from "./mcp";

const ORIGIN = import.meta.env.DEV ? "http://localhost:5173" : "https://notes.example.com";

// Everything a person reaches is behind Cloudflare Access: the web page (public/,
// served as static assets), /api/* and /authorize. Access lets MCP clients
// through to /mcp, /oauth/* and /.well-known/* without a login, and those use
// OAuth tokens that only /authorize can hand out.
const site: ExportedHandler<Env> = {
	async fetch(request, env) {
		const url = new URL(request.url);
		const isApi = url.pathname.startsWith("/api/");
		if (!isApi && url.pathname !== "/authorize") return new Response("Not found", { status: 404 });

		const me = await ownerEmail(request, env);
		if (!me) return new Response("Forbidden", { status: 403 });
		if (isApi) return handleApi(request, env, url, me);
		return authorize(request, env, me);
	},
};

export default new OAuthProvider<Env>({
	apiRoute: "/mcp",
	apiHandler: {
		fetch: (request, env, ctx) => createMcpHandler(() => createServer(env))(request, env, ctx),
	},
	defaultHandler: site,
	authorizeEndpoint: "/authorize",
	tokenEndpoint: "/oauth/token",
	clientRegistrationEndpoint: "/oauth/register",
	clientIdMetadataDocumentEnabled: true,
	scopesSupported: ["notes"],
	resourceMetadata: {
		resource: `${ORIGIN}/mcp`,
		authorization_servers: [ORIGIN],
		resource_name: "audrey.wiki",
	},
});
