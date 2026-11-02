import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";
import { deployment } from "./deployment.ts";

export default defineConfig({
	plugins: [cloudflare()],
	define: { "import.meta.env.VITE_SITE_ORIGIN": JSON.stringify(deployment.siteOrigin) },
});
