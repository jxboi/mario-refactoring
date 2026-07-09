# Chisel — a refactoring cockpit

A calm, fast board for steadily chipping away at a codebase. Import a JSON file of refactoring items, triage them, and walk each one through a workflow designed for refactoring — not generic task management.

## Run it

```sh
npm install
npm run dev      # https://localhost:5180
```

Use Node 20 LTS or Node 22+; Node 19 is not supported by this dependency set.

`npm run build` produces a static production build in `dist/`.

For database-backed sync, run through Vercel so the `/api` functions are served too:

```sh
npm run dev:vercel
```

## Sign in with GitHub

Chisel gates the board behind a GitHub sign-in and keeps each account's boards separate.

1. Create an OAuth App at **GitHub → Settings → Developer settings → OAuth Apps**, and enable **Device Flow**.
2. Copy `.env.example` to `.env` and set `VITE_GITHUB_CLIENT_ID` to the app's Client ID.
3. Restart `npm run dev` and click **Sign in with GitHub** — you'll get a short code to enter at github.com/login/device.

Sign-in uses the [OAuth Device Flow](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps#device-flow), so no client secret is needed. GitHub's device/token endpoints don't send CORS headers, so the dev server proxies them (the `/gh` entry in [vite.config.ts](vite.config.ts)). A production deployment needs the same proxy in front of `github.com`.

## Persistent storage

GitHub is used for identity. Signed-in boards sync through a Vercel Function at `/api/board`, which verifies the GitHub token server-side and stores the board document in Neon Postgres. Guest boards remain local-only.

Provision Neon through the Vercel Marketplace:

```sh
vercel link
vercel integration add neon
vercel env pull .env.local --yes
npm run dev:vercel
```

The Neon integration injects `POSTGRES_URL` into Vercel. Locally, `vercel env pull` writes it to `.env.local`. The API creates the required table automatically; the same schema is also captured in [db/schema.sql](db/schema.sql).

Remote saves are debounced and version-checked. If another session updates the same board first, Chisel pauses cloud sync and surfaces the conflict in the account menu instead of overwriting remote data silently. The latest local state still remains in `localStorage`.

## The workflow

| Stage           | Meaning                                  |
| --------------- | ---------------------------------------- |
| **Triage**      | Imported, not yet assessed               |
| **Scoped**      | Risk and effort assessed, ready to start |
| **Refactoring** | Actively being reworked                  |
| **Verifying**   | Tests, review, canary                    |
| **Landed**      | Merged and done                          |

Every item carries refactoring-specific metadata: **risk** (low/medium/high), **effort** (low/medium/high), **category** (extract, rename, dead code, dependency, performance, tests, architecture, style), affected **files/paths**, **tags**, timestamped **notes**, and a **blocker** flag with a reason — blocked items are flagged on the card itself, not hidden in a column.

## Importing items

Drag a `.json` file anywhere onto the page (or click **Import JSON**). Chisel parses it, validates every row, previews what it found — including warnings for values it had to normalize and rows it will skip — and lets you choose what to import. See [example-refactors.json](example-refactors.json) for a sample.

The parser is deliberately forgiving:

- Accepts a top-level array, or an object with an `items` / `tasks` / `refactorings` / `entries` array.
- Titles from `title`, `name`, or `summary`; descriptions from `description`, `details`, `body`, or `rationale`.
- Risk from `risk` / `severity` / `impact` (words or numbers), effort from `effort` / `size` / `estimate` / `points`, category from `category` / `type` / `kind` (with fuzzy matching), stage from `status` / `stage` / `state` (`todo`, `in-progress`, `review`, `done`, …).
- Files from `files` / `file` / `paths` / `path` / `modules`; tags from `tags` / `labels`.
- `blocked` / `blocked_reason` mark an item blocked on import.

Only a title is required — everything else gets sensible defaults.

## Everything else

- **Projects** — the switcher next to the logo creates, renames, deletes, and switches between independent boards (one per codebase or cleanup effort).
- The board is grouped visually: Triage/Scoped recede, the amber **in-flight zone** (Refactoring + Verifying) is where the eye lands, Landed is dimmed.
- Drag cards between stages; click a card to open the detail drawer and edit metadata, mark blockers, or add notes. The **＋** in any column header (or "New item" on an empty board) creates an item by hand.
- Search across titles, files, and tags; filter by risk chips, or click the red blocked count in the header to see only blocked items.
- State persists instantly in `localStorage`; signed-in GitHub accounts also sync their board across devices through Vercel + Neon Postgres.

Built with React + TypeScript + Vite. No UI framework, no state library — one reducer, one stylesheet.
