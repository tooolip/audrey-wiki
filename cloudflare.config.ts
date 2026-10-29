import { bindings, defineConfig } from "cf/config";
import * as entrypoint from "./src/index.ts" with { type: "cf-worker" };

export default defineConfig({
	accountId: "00000000000000000000000000000000",
	worker: {
		name: "audrey-wiki",
		compatibilityDate: "2026-10-23",
		compatibilityFlags: ["nodejs_compat"],
		entrypoint,
		domains: ["audrey.wiki"],
		workersDev: false,
		previewUrls: false,
		// public/ is served as static assets. These paths always reach the Worker instead.
		assets: {
			runWorkerFirst: ["/api/*", "/mcp", "/mcp/*", "/authorize", "/oauth/*", "/.well-known/*"],
		},
		observability: { enabled: true },
		env: {
			DB: bindings.d1({ id: "00000000-0000-4000-8000-000000000000", name: "audrey-wiki" }),
			OAUTH_KV: bindings.kv({ id: "00000000000000000000000000000000" }),
			// Cloudflare Access in front of the site. Only OWNER_EMAIL gets in.
			ACCESS_TEAM_DOMAIN: bindings.text("https://example-team.cloudflareaccess.com"),
			// The "audrey.wiki" Access application. A second one, "audrey.wiki agent endpoints",
			// bypasses login for /mcp, /oauth and /.well-known.
			ACCESS_AUD: bindings.text("0000000000000000000000000000000000000000000000000000000000000000"),
			OWNER_EMAIL: bindings.text("owner@example.com"),
		},
	},
});
