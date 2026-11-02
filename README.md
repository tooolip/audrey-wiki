# Audrey Wiki

A private markdown notes app with a browser editor and an MCP server. Notes are organized by folder-like paths and stored in Cloudflare D1. Agents and the web interface use the same note operations.

## Features

- Create, search, edit, move, and delete markdown notes.
- Organize notes into nested folders, including empty folders.
- Prevent accidental overwrites with version-checked writes.
- Connect MCP clients through OAuth with an owner-approved consent screen.
- Protect the browser app with Cloudflare Access and verify the owner's identity inside the Worker.

The repository contains application source and schema migrations. A deployed instance's notes and owner configuration are not included.

## Run locally

Requires Node.js 22.18 or later and Bun. The project uses the pinned `cf` CLI, not Wrangler.

```sh
bun install --frozen-lockfile
cp deployment.config.example.json deployment.config.json
bunx cf d1 migrations apply 00000000-0000-4000-8000-000000000000 --local --persist-to .cloudflare/state
bunx cf dev
```

Open [localhost:5173](http://localhost:5173). The example configuration uses placeholder resource IDs and `owner@example.com`. Local development bypasses Access; production builds verify the Access JWT and owner email.

`deployment.config.json` is ignored by Git. Set your own account ID, D1 and KV IDs, site origin, domains, Access team domain, Access audience, and owner email there before deploying. If the file is absent, tooling falls back to the example for local setup.

```sh
bun run typecheck
bun run build
```

## Deploy your own instance

1. Create a Cloudflare D1 database and KV namespace. Set their IDs in your private configuration.
2. Configure Cloudflare Access to protect the site, `/api/*`, and `/authorize`. Allow only the intended owner.
3. Create an Access bypass policy for `/mcp`, `/oauth/*`, and `/.well-known/*`. Those endpoints use the application's OAuth flow.
4. Set `siteOrigin` and `domains` to the same deployment origin. Keep `workersDev` and preview URLs disabled unless their access protection is configured too.
5. Apply the D1 migrations and deploy:

```sh
bunx cf d1 migrations apply YOUR_DATABASE_ID
bunx cf deploy
```

The GitHub Actions workflow restores configuration from the `DEPLOYMENT_CONFIG_JSON` repository secret. It also needs `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`. It type-checks, applies migrations, and deploys on pushes to `main`.

## Connect an MCP client

Use `https://YOUR_DOMAIN/mcp` as the server URL. The client registers through OAuth and opens the protected consent screen. Approving a client grants note-reading and editing access, including deletion. Keep the owner check and Access policies in place when adapting the app.

## Project layout

| Path | Purpose |
| --- | --- |
| `src/notes.ts` | Shared note operations and version checks |
| `src/api.ts` | JSON API for the browser |
| `src/mcp.ts` | MCP tools |
| `src/auth.ts`, `src/authorize.ts` | Owner verification and OAuth consent |
| `public/` | Plain HTML, CSS, and JavaScript interface |
| `migrations/` | Numbered D1 schema changes |
| `deployment.config.example.json` | Safe starting configuration |

Markdown rendering uses DOMPurify and the site's Content Security Policy. Preserve those protections when adding features.
