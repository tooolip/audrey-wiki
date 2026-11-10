import { defineConfig } from "cf/config";
import { deployment } from "../deployment.ts";
import * as entrypoint from "./src/index.ts" with { type: "cf-worker" };

// The audrey.wiki landing page. Static files in public/ are served first;
// anything else falls through to the Worker and gets a 404.
export default defineConfig({
	accountId: deployment.accountId,
	worker: {
		name: "audrey-wiki-landing",
		compatibilityDate: "2026-10-23",
		entrypoint,
		domains: deployment.landingDomains ?? [],
		workersDev: false,
		previewUrls: false,
		observability: { enabled: true },
	},
});
