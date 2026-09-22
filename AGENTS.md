## Instructions

- Present a complete implementation plan and wait for explicit user approval before creating or modifying any files. Read-only codebase exploration to prepare the plan is permitted.
- Use `pnpm` instead of `npm`.
- If you make any changes to the database schema, generate a database migration with `pnpm run db-generate` and apply it with `pnpm run db-migrate`.
- If you think this Next.js version's APIs, conventions, or file structure differ from your training data, read the relevant guide in `node_modules/next/dist/docs/` before writing code.
- Refer to `.env.example` to see which environment variables are available.
- When implementing a ticket, include the ticket status update in the same commit: update its `Status:` line to `done` (or the appropriate state) and check off all completed acceptance criteria (`- [ ]` to `- [x]`). A ticket is only `done` when every acceptance criterion is met. Do NOT split this into a separate docs-only commit.
- All UI development must strictly adhere to the Claude Editorial Design System and light-mode governance rules in [.agents/rules/ui-design.md](.agents/rules/ui-design.md) (see also [ADR 0008](docs/adr/0008-claude-editorial-design-system.md)).

## Tech stack

- Authentication: [better-auth](https://better-auth.com/docs/basic-usage)
- Database: Postgres with [drizzle-orm](https://orm.drizzle.team/docs/overview)

## Agent skills

### Issue tracker

Local markdown files in `.scratch/<feature-slug>/`. See `docs/agents/issue-tracker.md`.

### Triage labels

Default canonical roles (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context repository (`CONTEXT.md` and `docs/adr/` at the repo root). See `docs/agents/domain.md`.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
