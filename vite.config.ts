import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig, type Plugin } from "vite";
import { deployment } from "./deployment.ts";

// In production the audrey-rocks gateway serves the shared theme (/_dusk/, the
// favicon). In dev, serve it from the sibling checkout so the page looks the same.
const THEME = join(import.meta.dirname, "../audrey-rocks/public");
const TYPES: Record<string, string> = { ".css": "text/css", ".woff2": "font/woff2", ".jpg": "image/jpeg", ".svg": "image/svg+xml" };
const sharedTheme: Plugin = {
	name: "shared-theme",
	apply: "serve",
	configureServer(server) {
		server.middlewares.use(async (req, res, next) => {
			const path = (req.url ?? "").split("?")[0];
			if (!path.startsWith("/_theme/") && path !== "/favicon.svg" && path !== "/favicon.ico") return next();
			const file = normalize(join(THEME, path));
			if (!file.startsWith(THEME)) return next();
			try {
				const body = await readFile(file);
				res.setHeader("Content-Type", TYPES[extname(file)] ?? "application/octet-stream");
				res.end(body);
			} catch {
				next();
			}
		});
	},
};

export default defineConfig({
	base: "/notes/",
	plugins: [sharedTheme, cloudflare()],
	server: { port: 5195, strictPort: true },
	define: { "import.meta.env.VITE_SITE_ORIGIN": JSON.stringify(deployment.siteOrigin) },
});
