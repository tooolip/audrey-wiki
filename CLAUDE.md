# Notes app maintenance

- Keep note behavior in `src/notes.ts`; the JSON API and MCP server both call it.
- Notes are addressed by path without a `.md` suffix. Preserve version checks on writes.
- Keep both Cloudflare Access JWT validation and the owner-email check. OAuth alone does not replace owner authorization.
- In production, protect the site and `/authorize` with Access. MCP, OAuth, and discovery endpoints use OAuth and need a separate Access bypass policy.
- Render user-written content through the existing sanitization helpers. Keep the CSP.
- Add schema changes as new numbered files in `migrations/`.
- Use Bun and the pinned `cf` CLI, through `bunx cf`. Run `bun run typecheck` before publishing changes.
- Actual deployment identifiers and owner details belong in ignored `deployment.config.json`, never in source or examples.
- Notes live in the deployed database, not this repository. Source maintenance does not authorize editing personal notes.
- See README.md for local setup and deployment.
