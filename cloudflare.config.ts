import { bindings, defineConfig } from "cf/config";
import { deployment } from "./deployment.ts";
import * as entrypoint from "./src/index.ts" with { type: "cf-worker" };

export default defineConfig({
	accountId: deployment.accountId,
	worker: {
		name: "audrey-wiki",
		compatibilityDate: "2026-10-23",
		compatibilityFlags: ["nodejs_compat"],
		entrypoint,
		domains: deployment.domains,
		workersDev: false,
		previewUrls: false,
		// public/ is served as static assets. These paths always reach the Worker instead.
		assets: {
			runWorkerFirst: ["/api/*", "/mcp", "/mcp/*", "/authorize", "/oauth/*", "/.well-known/*"],
		},
		observability: { enabled: true },
		env: {
			DB: bindings.d1({ id: deployment.databaseId, name: "audrey-wiki" }),
			OAUTH_KV: bindings.kv({ id: deployment.kvId }),
			// Cloudflare Access in front of the site. Only OWNER_EMAIL gets in.
			ACCESS_TEAM_DOMAIN: bindings.text(deployment.accessTeamDomain),
			// The site Access application. A second application
			// bypasses login for /mcp, /oauth and /.well-known.
			ACCESS_AUD: bindings.text(deployment.accessAud),
			OWNER_EMAIL: bindings.text(deployment.ownerEmail),
		},
	},
});
