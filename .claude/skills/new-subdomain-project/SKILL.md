---
name: new-subdomain-project
description: Set up a new project as its own repo, hosted on a subdomain of audrey.wiki (name.audrey.wiki) on Cloudflare Workers, with deploys, optional Access protection, and monitoring. Use when Audrey has a new idea to build and host, or asks to "set up", "start" or "spin up" a new subdomain or project.
---

# New subdomain project

Each idea gets its own GitHub repo and its own `<name>.audrey.wiki` subdomain. `audrey.wiki` itself is a public landing page (`landing/` in this repo). `monitor.audrey.wiki` (repo `tooolip/monitor`) checks every subdomain twice a day.

This skill takes an empty repo to a deployed, monitored subdomain.

## Before starting

Confirm these, and ask only for what's missing:

1. **Name.** The subdomain label: lowercase letters, numbers and hyphens. Check that it isn't already taken (see step 1).
2. **Repo.** Audrey creates an empty repo on GitHub. Claude can't create repos from a cloud session. Attach it to the session with `add_repo`, along with `tooolip/monitor` if it isn't attached already.
3. **Public or private.** Private means behind Cloudflare Access, so only Audrey can get in. Default to private for anything holding personal data.
4. **What it does,** in a sentence or two. This shapes the scaffold: a static page, a Worker with an API, or one that needs D1 or KV.
5. **Cloudflare access.** The `audrey.wiki` cloud environment holds a Cloudflare API token for `api.cloudflare.com`. If calls return 401 or 403, the session is on a different environment, or the token is missing a permission. Say which one and stop.

## 1. Check the zone

Look up the IDs with the API. Never hard-code them in source, because CLAUDE.md keeps deployment identifiers out of repos:

```sh
B=https://api.cloudflare.com/client/v4
curl -sS "$B/zones?name=audrey.wiki"                 # zone id and account id
curl -sS "$B/zones/$ZONE/dns_records?per_page=100"    # existing records
curl -sS "$B/accounts/$ACCOUNT/workers/domains"       # Worker custom domains
curl -sS "$B/zones/$ZONE/workers/routes"              # Worker routes
curl -sS "$B/accounts/$ACCOUNT/access/apps"           # Access applications
```

If the name already shows up in any of these, stop and ask.

## 2. Scaffold the repo

Copy the patterns from this repo instead of inventing new ones. `landing/` is the smallest working example, and the repo root is the full example with an API, D1, KV, Access and OAuth.

- **Tooling:** Bun, plus the `cf` CLI pinned to the same exact version as this repo's `package.json`. Pin every dependency exactly, with no `^`.
- **`cloudflare.config.ts`:** set `workersDev: false` and `previewUrls: false`, and take `domains` from config.
- **`deployment.ts` and `deployment.config.example.json`:** placeholder IDs only. Gitignore the real `deployment.config.json`.
- **`public/_headers`:** a strict CSP that starts from `default-src 'none'` or `'self'`, plus `nosniff` and `no-referrer`. Only loosen it for something the app actually needs.
- **Private apps:** copy `src/auth.ts`, which checks the Access JWT and the owner email inside the Worker. Access alone isn't enough.
- **`.github/workflows/deploy.yml`:** copy this repo's workflow. It restores the config from the `DEPLOYMENT_CONFIG_JSON` secret, typechecks, applies migrations if there are any, and deploys.
- **`CLAUDE.md`:** a few lines covering where logic lives and which security checks to keep, adapted from this repo's file.
- **`README.md`:** what the project is, how to run it locally, and how to deploy it.
- Copy `.claude/skills/frontend-design/` into the new repo if it has any UI, and follow it.

Run `bun run typecheck` and `bun run build` before committing.

## 3. Cloudflare setup

Each of these changes live infrastructure, so tell Audrey what you're about to do and get a yes first.

1. **Private projects:** create an Access self-hosted application for `<name>.audrey.wiki`. Copy the allow policy (the include rule) from the existing `audrey.wiki` Access app rather than typing the email. Put the new app's AUD tag in the private config.
2. **MCP or OAuth endpoints:** these need a separate Access bypass app. Session safety checks block creating bypass rules, so give Audrey the exact hostnames and paths to add in the dashboard (Zero Trust → Access → Applications).
3. **Custom domain:** `cf deploy` attaches the hostnames in `domains` and creates the DNS record. Don't add DNS records by hand unless the deploy fails to.

## 4. Secrets and first deploy

Audrey has to add these GitHub repo secrets, because Claude can't write secrets:

- `CLOUDFLARE_API_TOKEN`: a token that can deploy Workers.
- `CLOUDFLARE_ACCOUNT_ID`
- `DEPLOYMENT_CONFIG_JSON`: the full private config. Write it out for her with the real IDs you looked up, except the owner email, which she fills in.

Then merge to `main`. The workflow deploys.

## 5. Monitor it

In `tooolip/monitor`, add a line to `DEFAULT_TARGETS` in `lib/config.ts`:

```ts
{ hostname: '<name>.audrey.wiki', repo: 'tooolip/<repo>', host: 'Cloudflare Workers', protected: <true|false>, zone: 'audrey.wiki' },
```

Update the "Cloudflare inventory was verified on" date in its README. Then run `npm run typecheck` and `node --test tests/health.test.ts`, and push a branch. The monitor deploys by hand with `npm run deploy`.

## 6. Verify and report

- `curl -sI https://<name>.audrey.wiki/` should return 200 for a public site, or a redirect to the Access login for a private one. If this session's network blocks the host, say so instead of guessing.
- Finish with a short list for Audrey:
  - what was created
  - the branches pushed
  - what she still needs to do (secrets, dashboard steps, merges, the monitor deploy)
  - the URL
