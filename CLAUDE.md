# audrey.wiki

Private notes app at https://notes.example.com: folders of markdown notes, edited in the browser, plus an MCP server so agents can use them. Cloudflare Worker + D1, free tier. Only the configured owner can get in.

- `src/notes.ts`: all the note logic. Notes are rows addressed by path, like `Projects/Wiki ideas` (no `.md`). Folders are implied by paths; the `folders` table also keeps empty ones. Each note has a `version` that goes up on every write; `if_version` makes a write fail if someone else changed the note first. `UserError` is for input mistakes the caller can see.
- `src/api.ts` (JSON API for the web page) and `src/mcp.ts` (MCP tools) both call `notes.ts`. Keep behaviour in `notes.ts`, not in the two front doors.
- `src/index.ts`: routing. `OAuthProvider` from `@cloudflare/workers-oauth-provider` owns `/mcp`, `/oauth/*` and `/.well-known/*`; everything else goes to the site handler.
- `src/auth.ts`, `src/authorize.ts`: who gets in. See Auth below.
- `public/`: the web page, plain HTML/CSS/JS with no build step. Markdown is rendered with marked and sanitized with DOMPurify (pinned on cdnjs with SRI). Build DOM with `el()`, not innerHTML, for anything from a note. `public/_headers` sets the CSP.
- `migrations/`: D1 schema. Add changes as new numbered files.

## Auth

- Cloudflare Access (Zero Trust team `example-team`, free plan) protects the whole domain. The "audrey.wiki" Access app allows only the configured owner email; its AUD tag is `ACCESS_AUD` in `cloudflare.config.ts`.
- A second Access app, "audrey.wiki agent endpoints", bypasses login for `/mcp`, `/oauth` and `/.well-known`. Those paths are protected by OAuth instead: MCP clients register, send Audrey to `/authorize` (behind Access) to approve them, and get a token.
- The Worker checks the Access JWT itself too (`ownerEmail`), so a mistake in the Access setup can't expose notes. Never remove that check.
- In local dev (`import.meta.env.DEV`) there's no Access, so `ownerEmail` returns the owner. Vite strips that branch from production builds; check `.cloudflare/output` if you touch it.

## Tooling

Uses the `cf` CLI (pinned in devDependencies) and `bun`. No Wrangler. `cf` needs Node 22.18+ and doesn't run on Bun, so call it through `bunx cf`, which respects its node shebang.

- `bun install`, `bunx cf dev` (http://localhost:5173), `bun run typecheck`
- Local D1: `bunx cf d1 migrations apply 00000000-0000-4000-8000-000000000000 --local --persist-to .cloudflare/state`
- Remote D1: same without `--local --persist-to …`
- Deploys: pushing to `main` on GitHub (tooolip/audrey-wiki, private) type checks, applies migrations and runs `cf deploy` via `.github/workflows/deploy.yml`. `bunx cf deploy` from a laptop also works.
