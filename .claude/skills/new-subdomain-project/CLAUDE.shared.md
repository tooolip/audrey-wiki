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
