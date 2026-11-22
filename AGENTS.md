# audrey-wiki (notes at audrey.rocks/notes)

Codex is the primary maintainer of this project. This file is the canonical repository guidance; CLAUDE.md just points here.

The notes app at https://audrey.rocks/notes/: folders of markdown notes, edited in the browser, plus an MCP server so agents can use them. Cloudflare Worker + D1, free plan. Anyone with a Google account can sign in and keep their own notes; Audrey's account is the only dev account. (Until 2026-11-22 it was a single-owner app at notes.audrey.wiki, which now redirects here.)

- `src/notes.ts`: all the note logic. Notes are rows addressed by `(owner, path)`, like `Projects/Wiki ideas` (no `.md`). Every function takes a `Scope` (`db`, `owner`, optional `caps`), and every query is scoped to that owner. Folders are implied by paths; the `folders` table also keeps empty ones. Each note has a `version` that goes up on every write; `if_version` makes a write fail if someone else changed the note first. `UserError` is for input mistakes the caller can see.
- `src/api.ts` (JSON API for the web page, `/notes/api/*`) and `src/mcp.ts` (MCP tools) both call `notes.ts`. Keep behaviour in `notes.ts`, not in the two front doors.
- `src/index.ts`: routing. `OAuthProvider` from `@cloudflare/workers-oauth-provider` owns `/notes/mcp`, `/notes/oauth/*` and the root `/.well-known/oauth-*` documents; everything else goes to the site handler. A daily cron runs `src/cleanup.ts`.
- `src/auth.ts`, `src/authorize.ts`: who gets in. See Auth below.
- `src/rocks-users.ts`: roles, limits and daily counters. A copy of `~/Code/audrey-rocks/shared/rocks-users.ts`; change it there and copy it over.
- `src/admin.ts`: `/notes/admin`, dev only: every account with its usage, and suspend / restore / delete buttons.
- `src/cleanup.ts`: daily account housekeeping for all of audrey.rocks (suspend accounts at a limit three days running, pause sign-ups after a burst, flag spammy notes, delete inactive and suspended accounts).
- `public/`: the web page, served as static assets under `/notes` (`assets.basePath`). Plain HTML/CSS/JS with no build step, styled on top of the shared Hudson Dusk theme at `/_dusk/dusk.css` (served by audrey-rocks). Markdown is rendered with marked and sanitized with DOMPurify (pinned on cdnjs with SRI). Build DOM with `el()`, not innerHTML, for anything from a note. `public/_headers` sets the CSP.
- `migrations/`: D1 schema. Add changes as new numbered files.

## Auth

- The audrey-rocks gateway Worker (`~/Code/audrey-rocks`) owns audrey.rocks and forwards `/notes/*` here over a service binding. This Worker has no hostname, so nothing else can reach it.
- Cloudflare Access (team `plain-snowflake-81db`, free plan) protects `/notes` and `/tools` with the "audrey.rocks members" app: Google is the only login method and the policy is anyone with Google. Its AUD tag is `accessAud` in `deployment.config.json`.
- A second Access app, "audrey.rocks notes agent endpoints", bypasses login for `/notes/mcp` and `/notes/oauth`. Those use OAuth instead: MCP clients register, send the person to `/notes/authorize` (behind Access) to approve them, and get a token. For now only the dev account may approve agents (KV, where tokens live, allows 1,000 writes a day on the free plan).
- The gateway verifies the Access JWT, keeps the shared users table (`audrey-rocks-users` D1), applies suspensions and per-minute limits, and adds `x-rocks-user`, `x-rocks-role` and `x-rocks-email`. This Worker still verifies the Access JWT itself and checks it names the same email (`currentUser`), so a mistake in Access or the gateway can't expose anyone's notes. Never remove that check.
- Basic accounts have caps (note count, total size, saves per day; see `LIMITS`). Dev has none.
- In local dev (`import.meta.env.DEV`) there's no Access or gateway, so `currentUser` returns the dev account. Vite strips that branch from production builds.

## Tooling

Uses the `cf` CLI (pinned in devDependencies) and `bun`. No Wrangler. `cf` needs Node 22.18+ and doesn't run on Bun, so call it through `bunx cf`, which respects its node shebang.

- `bun install`, `bunx vite` (http://localhost:5195/notes/, with the shared theme served from `../audrey-rocks/public`), `bun run typecheck`
- Local D1: `bunx cf d1 migrations apply <databaseId> --local --persist-to .cloudflare/state`, and the users DB with `--dir ../audrey-rocks/migrations`
- Remote D1: same without `--local --persist-to …`
- Deploys: pushing to `main` on GitHub (tooolip/audrey-wiki) type checks, applies migrations and runs `cf deploy` via `.github/workflows/deploy.yml`, using the `DEPLOYMENT_CONFIG_JSON` secret. `bunx cf deploy` from a laptop also works.

## Personal notes skills

The versioned skills in `skills/` interact with the deployed notes through the MCP
server at `https://audrey.rocks/notes/mcp`, configured in Codex as `audrey-wiki`:

- `wiki-find`: find notes and answer questions from them.
- `wiki-capture`: save new notes and update existing ones.
- `wiki-organize`: organize folders, consolidate duplicates, and repair affected links.

Keep their tool guidance aligned with `src/mcp.ts` and `src/notes.ts` when changing
the server. Local symlinks in `~/.codex/skills/` make them available outside this
repository. Each skill declares its MCP dependency in `agents/openai.yaml`.
On another machine, link these skill directories into the local skills directory,
then run `codex mcp add audrey-wiki --url https://audrey.rocks/notes/mcp` and complete
OAuth login (`codex mcp login audrey-wiki` if needed).

Personal note content belongs in the notes, not in this source repository. Use MCP
for note work; direct D1 access is for explicitly requested maintenance. Creating
or editing skills does not itself authorize changes to personal notes. That goes
for other people's notes too: maintaining the code never authorizes reading them.

## audrey.rocks project rules

Every audrey.rocks app repo carries this section word for word. Change it in `~/Code/audrey-rocks/CLAUDE.md` first, then copy it into the other repos.

- audrey.rocks is one gateway Worker (`~/Code/audrey-rocks`) that serves the home page and forwards a path prefix to each app's Worker over a service binding. Apps have no hostname, `workers.dev` or preview URLs of their own. The home page lists every app and `~/Code/rocks-monitor` checks each one; update both when an app is added, renamed or retired.
- Public apps (`/claude-blog`, `/monitor`) need no sign-in. Member apps (`/tools`, `/notes`) sit behind Cloudflare Access with Google. The gateway decides the role (dev or basic) and passes it on; an app with people's data also verifies the Access JWT itself.
- Anything that costs Cloudflare usage per person counts against the daily limits in `rocks-users.ts`, and limits are sized to keep most of the free plan for dev.
- Never put emails, Access audience tags or API tokens in source. Look them up with the Cloudflare API or keep them in ignored config and secrets.
- Serve pages with a strict Content Security Policy, `X-Content-Type-Options: nosniff` and `Referrer-Policy: no-referrer`. Loosen the CSP only for something the app actually uses.
- Design follows the Hudson Dusk showcase (tooolip/hudson-dusk-design, `docs/index.html`), using the shared `/_dusk/dusk.css`.
- Pin dependencies to exact versions. Work on a branch and run the typecheck before pushing.
- People's data lives in the deployed databases, not the repo. Maintaining the code doesn't authorize reading or editing it.
