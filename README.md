# clickup-dashboard

Private, password-protected dashboard of personal productivity stats from ClickUp. Served at `overview.waffleruntime.com` from the `parthica` VPS.

Stack: TanStack Start (React 19, Nitro node server), shadcn/ui + Tailwind v4, TanStack Query/Table, SQLite via Drizzle.

## Development

Requires Node 24 (`nvm use`) and pnpm.

```sh
pnpm install
cp .env.example .env    # then fill it in, see below
pnpm dev                # http://localhost:3400
```

`.env`:

- `SESSION_SECRET`: `openssl rand -base64 48`
- `DASHBOARD_PASSWORD_HASH`: paste the line printed by `pnpm hash-password`
- `CLICKUP_TOKEN`, `CLICKUP_TEAM_ID`: needed once sync lands

## Scripts

| Script | Does |
|---|---|
| `pnpm dev` | Dev server, loads `.env` |
| `pnpm build` / `pnpm start` | Production build / run it |
| `pnpm check` | Biome + TypeScript |
| `pnpm format` | Biome autofix |
| `pnpm db:generate` | Create a migration after editing `src/server/db/schema.ts` |
| `pnpm hash-password` | Print a password hash for `.env` |

Migrations in `drizzle/` apply automatically on startup.

## Auth

One password, stored only as an argon2 hash. Login sets a 30-day HMAC-signed, httpOnly cookie. Pages under `src/routes/_authed/` redirect to `/login`, and data server functions must use the `requireAuth` middleware from `src/server/auth.ts`. Failed logins are limited to 5 per IP per minute. Rotating `SESSION_SECRET` signs out every device.

`/api/health` is the only unauthenticated endpoint besides login.

## ClickUp sync

A Nitro plugin (`src/server/plugins/sync.ts`) starts a scheduler with the server. It mirrors the workspaces in `CLICKUP_TEAM_ID` (comma-separated) into SQLite, read-only, and every chart reads from SQLite. A workspace added later gets its own full pass on the next run.

| Run | When | Does |
|---|---|---|
| backfill | first start, until one succeeds | all tasks (active + archived), hierarchy, all time entries |
| incremental | every `SYNC_INTERVAL_MINUTES` (15) and "Sync now" | hierarchy, tasks updated since the last good run minus 5 min, last 7 days of time entries |
| reconcile | nightly after 03:00 `TZ` | full task pass; tasks it no longer sees are checked one by one, then marked `deleted_at` |

- Requests are capped at 80/min (ClickUp allows 100). 429s wait for `X-RateLimit-Reset`, 5xx retry 3 times, a 401 pauses syncing until "Sync now".
- Responses are parsed with the zod schemas in `src/server/clickup/schemas.ts`. Only listed fields are kept: no descriptions, comments, emails or names of other people.
- Stats count tasks where `is_mine` is true: assigned to the token's user, or to nobody.
- Due-date changes are recorded in `task_due_changes` as the sync sees them; ClickUp's API has no task history.
- `SYNC_ENABLED=false` turns the scheduler off.

`sync_runs` logs every run, which the sidebar's sync indicator reads.
