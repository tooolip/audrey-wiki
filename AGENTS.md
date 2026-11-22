# audrey.wiki

Codex is the primary maintainer of this project. This file is the canonical repository guidance.

Audrey's private notes app at https://audrey.wiki: folders of markdown notes, edited in the browser, plus an MCP server so agents can use them. Cloudflare Worker + D1, free tier. Only Audrey can get in.

- `src/notes.ts`: all the note logic. Notes are rows addressed by path, like `Projects/Wiki ideas` (no `.md`). Folders are implied by paths; the `folders` table also keeps empty ones. Each note has a `version` that goes up on every write; `if_version` makes a write fail if someone else changed the note first. `UserError` is for input mistakes the caller can see.
- `src/api.ts` (JSON API for the web page) and `src/mcp.ts` (MCP tools) both call `notes.ts`. Keep behaviour in `notes.ts`, not in the two front doors.
- `src/index.ts`: routing. `OAuthProvider` from `@cloudflare/workers-oauth-provider` owns `/mcp`, `/oauth/*` and `/.well-known/*`; everything else goes to the site handler.
- `src/auth.ts`, `src/authorize.ts`: who gets in. See Auth below.
- `public/`: the web page, plain HTML/CSS/JS with no build step. Markdown is rendered with marked and sanitized with DOMPurify (pinned on cdnjs with SRI). Build DOM with `el()`, not innerHTML, for anything from a note. `public/_headers` sets the CSP.
- `migrations/`: D1 schema. Add changes as new numbered files.

## Auth

- Cloudflare Access (Zero Trust team `plain-snowflake-81db`, free plan) protects the whole domain. The "audrey.wiki" Access app allows only Audrey's email; its AUD tag is `ACCESS_AUD` in `cloudflare.config.ts`.
- A second Access app, "audrey.wiki agent endpoints", bypasses login for `/mcp`, `/oauth` and `/.well-known`. Those paths are protected by OAuth instead: MCP clients register, send Audrey to `/authorize` (behind Access) to approve them, and get a token.
- The Worker checks the Access JWT itself too (`ownerEmail`), so a mistake in the Access setup can't expose notes. Never remove that check.
- In local dev (`import.meta.env.DEV`) there's no Access, so `ownerEmail` returns the owner. Vite strips that branch from production builds; check `.cloudflare/output` if you touch it.

## Tooling

Uses the `cf` CLI (pinned in devDependencies) and `bun`. No Wrangler. `cf` needs Node 22.18+ and doesn't run on Bun, so call it through `bunx cf`, which respects its node shebang.

- `bun install`, `bunx cf dev` (http://localhost:5173), `bun run typecheck`
- Local D1: `bunx cf d1 migrations apply 4f4fc517-e2de-4b44-9931-d2bc7aa09932 --local --persist-to .cloudflare/state`
- Remote D1: same without `--local --persist-to …`
- Deploys: pushing to `main` on GitHub (tooolip/audrey-wiki, private) type checks, applies migrations and runs `cf deploy` via `.github/workflows/deploy.yml`. `bunx cf deploy` from a laptop also works.

## Personal notes skills

The versioned skills in `skills/` interact with the deployed wiki through its MCP
server at `https://audrey.wiki/mcp`, configured in Codex as `audrey-wiki`:

- `wiki-find`: find notes and answer questions from them.
- `wiki-capture`: save new notes and update existing ones.
- `wiki-organize`: organize folders, consolidate duplicates, and repair affected links.

Keep their tool guidance aligned with `src/mcp.ts` and `src/notes.ts` when changing
the server. Local symlinks in `~/.codex/skills/` make them available outside this
repository. Each skill declares its MCP dependency in `agents/openai.yaml`.
On another machine, link these skill directories into the local skills directory,
then run `codex mcp add audrey-wiki --url https://audrey.wiki/mcp` and complete
OAuth login (`codex mcp login audrey-wiki` if needed).

Personal note content belongs in the wiki, not in this source repository. Use MCP
for note work; direct D1 access is for explicitly requested maintenance. Creating
or editing skills does not itself authorize changes to personal notes.
