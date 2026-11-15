# audrey-wiki

The notes app at notes.audrey.wiki and the landing page at audrey.wiki.

## This project

- Keep note behavior in `src/notes.ts`; the JSON API and MCP server both call it.
- Notes are addressed by path without a `.md` suffix. Preserve version checks on writes.
- Keep both Cloudflare Access JWT validation and the owner-email check. OAuth alone does not replace owner authorization.
- In production, protect the site and `/authorize` with Access. MCP, OAuth, and discovery endpoints use OAuth and need a separate Access bypass policy.
- Render user-written content through the existing sanitization helpers. Keep the CSP.
- Add schema changes as new numbered files in `migrations/`.
- Use Bun and the pinned `cf` CLI, through `bunx cf`. Run `bun run typecheck` before publishing changes.
- Actual deployment identifiers and owner details belong in ignored `deployment.config.json`, never in source or examples.
- Notes live in the deployed database, not this repository. Source maintenance does not authorize editing personal notes.
- `landing/` is the audrey.wiki landing page, a separate Worker that shares `deployment.config.json`.
- Merging to `main` deploys both Workers through GitHub Actions, using the `DEPLOYMENT_CONFIG_JSON` secret.
- See README.md for local setup and deployment.

## audrey.wiki project rules

Every audrey.wiki project repo carries this section word for word. Change it here first (`tooolip/audrey-wiki`, `.claude/skills/new-subdomain-project/CLAUDE.shared.md`), then copy it into the other repos.

- One project is one repo, one Cloudflare Worker and one `<name>.audrey.wiki` hostname. The landing page at audrey.wiki (`landing/public/index.html` in `tooolip/audrey-wiki`) lists every site, and `tooolip/monitor` checks each one (`DEFAULT_TARGETS` in `lib/config.ts`). When a site is added, renamed or retired, update both.
- Every hostname, the landing page included, sits behind Cloudflare Access with the "Only Audrey" policy on the whole hostname. A Worker with its own API or data also verifies the Access JWT and the owner email itself. Access alone isn't enough.
- Keep `workers.dev` and preview URLs turned off.
- Never put the owner email, Access audience tags or API tokens in source. Public repos also keep account, zone and resource IDs out. Look them up with the Cloudflare API when they're needed.
- Serve pages with a strict Content Security Policy, `X-Content-Type-Options: nosniff` and `Referrer-Policy: no-referrer`. Loosen the CSP only for something the app actually uses.
- Pin dependencies to exact versions.
- Work on a branch and run the typecheck before pushing. This repo's own section says how it deploys.
- Follow `.claude/skills/frontend-design` for any UI work.
- Personal data lives in the deployed databases, not in the repo. Maintaining the code doesn't authorize reading or editing it.
