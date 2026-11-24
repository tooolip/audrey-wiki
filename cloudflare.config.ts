import { bindings, defineConfig, triggers } from "cf/config";
import { deployment } from "./deployment.ts";
import * as entrypoint from "./src/index.ts" with { type: "cf-worker" };

// Notes at audrey.rocks/notes. No hostname of its own: the audrey-rocks gateway
// forwards /notes/* and the root OAuth discovery documents here over a service binding.
export default defineConfig({
	accountId: deployment.accountId,
	worker: {
		name: "rocks-notes",
		compatibilityDate: "2026-10-23",
		compatibilityFlags: ["nodejs_compat"],
		entrypoint,
		domains: deployment.domains,
		workersDev: false,
		previewUrls: false,
		// public/ is served as static assets under /notes. These paths always reach the Worker instead.
		assets: {
			basePath: "/notes",
			runWorkerFirst: [
				"/notes/api/*",
				"/notes/mcp",
				"/notes/mcp/*",
				"/notes/authorize",
				"/notes/oauth/*",
				"/notes/admin",
				"/.well-known/*",
			],
		},
		observability: { enabled: true },
		// Daily account housekeeping (src/cleanup.ts).
		triggers: [triggers.scheduled({ schedule: "17 3 * * *" })],
		env: {
			DB: bindings.d1({ id: deployment.databaseId, name: "audrey-wiki" }),
			// Shared audrey-rocks users table (owned by the audrey-rocks repo).
			USERS: bindings.d1({ id: deployment.usersDatabaseId, name: "audrey-rocks-users" }),
			OAUTH_KV: bindings.kv({ id: deployment.kvId }),
			// Cloudflare Access with Google in front of /notes (the "audrey.rocks members"
			// app). A second app bypasses login for /notes/mcp and /notes/oauth.
			ACCESS_TEAM_DOMAIN: bindings.text(deployment.accessTeamDomain),
			ACCESS_AUD: bindings.text(deployment.accessAud),
		},
	},
});
