# audrey.rocks notes

A markdown notes app with a browser editor and an MCP server, running at [audrey.rocks/notes](https://audrey.rocks/notes/). Anyone with a Google account can sign in and keep their own notes. Notes are organized by folder-like paths and stored in Cloudflare D1. Agents and the web interface use the same note operations.

## Features

- Create, search, edit, move, and delete markdown notes, with `[[wiki links]]`.
- Organize notes into nested folders, including empty folders.
- Prevent accidental overwrites with version-checked writes.
- Keep each person's notes separate: every query is scoped to the signed-in owner.
- Daily limits and storage caps for regular accounts, and a daily job that suspends and removes spam and inactive accounts.
- Connect MCP clients through OAuth with a consent screen (currently the site owner only).

The repository contains application source and schema migrations. A deployed instance's notes, users and configuration are not included.

## How it's deployed

The app is one Cloudflare Worker with no hostname of its own. A separate gateway Worker owns the domain, signs people in with Cloudflare Access (Google), keeps a shared users table, and forwards `/notes/*` to this Worker over a service binding with the user's id and role in `x-rocks-*` headers. This Worker verifies the Access JWT again and checks it matches. Static files are served under `/notes` with `assets.basePath`.

## Run locally

Requires Node.js 22.18 or later and Bun. The project uses the pinned `cf` CLI, not Wrangler.

```sh
bun install --frozen-lockfile
cp deployment.config.example.json deployment.config.json
bunx cf d1 migrations apply 00000000-0000-4000-8000-000000000000 --local --persist-to .cloudflare/state
bunx vite
```

Open [localhost:5195/notes/](http://localhost:5195/notes/). Local development has no Access or gateway and signs you in as the dev account. The users table schema lives in the gateway's repository; apply it locally to the `usersDatabaseId` database the same way.

`deployment.config.json` is ignored by Git. Set your account ID, D1 and KV IDs, the users D1 ID, site origin, Access team domain and Access audience there before deploying.

```sh
bun run typecheck
bun run build
```
