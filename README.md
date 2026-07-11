# Chisel — a calm work cockpit

A focused board for steadily chipping away at code refactors or everyday tasks. Create items by hand, import structured JSON, or use a reusable AI prompt to turn a codebase audit into an actionable board.

Chisel organizes work as **workspaces → projects → items**. A workspace can hold any mix of the two project types:

- **Coding** boards track refactors with risk, effort, affected files, and code-focused categories.
- **Task** boards track general work with priority, effort, and task-focused categories.

Projects stay separate. Categories are shared between projects of the same type within a workspace, and reusable skills are available throughout that workspace.

## Run it

```sh
npm ci
npm run dev      # https://localhost:5180
```

Use Node 20 LTS or Node 22+; Node 19 is not supported by this dependency set.

`npm run build` produces a static production build in `dist/`.

For database-backed sync, run through Vercel so the `/api` functions are served too:

```sh
npm run dev:vercel
```

Plain `npm run dev` is a Vite-only, local-storage workflow: it does not execute the `/api/board` Vercel Function. Use `npm run dev:vercel` when testing GitHub account sync locally.

## Sign in with GitHub

Chisel gates the board behind a GitHub sign-in and keeps each account's boards separate.

1. Create an OAuth App at **GitHub → Settings → Developer settings → OAuth Apps**, and enable **Device Flow**.
2. Copy `.env.example` to `.env` and set `VITE_GITHUB_CLIENT_ID` to the app's Client ID.
3. Restart `npm run dev` and click **Sign in with GitHub** — you'll get a short code to enter at github.com/login/device.

Sign-in uses the [OAuth Device Flow](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps#device-flow), so no client secret is needed. GitHub's device/token endpoints don't send CORS headers, so the dev server proxies them (the `/gh` entry in [vite.config.ts](vite.config.ts)). A production deployment needs the same proxy in front of `github.com`.

## Persistent storage

GitHub is used for identity. Signed-in workspaces sync together through a Vercel Function at `/api/board`, which verifies the GitHub token server-side and stores the account document in Neon Postgres. Guest workspaces remain local-only.

Provision Neon through the Vercel Marketplace:

```sh
vercel link
vercel integration add neon
vercel env pull .env.local --yes
npm run dev:vercel
```

The Neon integration injects `POSTGRES_URL` into Vercel. Locally, `vercel env pull` writes it to `.env.local`. The API creates the required table automatically; the same schema is also captured in [db/schema.sql](db/schema.sql).

Remote saves are debounced and version-checked. If another session updates the account's workspaces first, Chisel pauses cloud sync and surfaces the conflict in the account menu instead of overwriting remote data silently. The latest local state still remains in `localStorage`.

Existing `chisel.projects.v2` browser data and legacy cloud board documents migrate automatically into a workspace named **My workspace**. Existing locally saved skills move into that workspace as part of the migration.

## Deploy to Vercel

After the project is linked and Neon is installed, deploy a preview:

```sh
vercel
```

Deploy to production:

```sh
vercel --prod
```

Vercel should detect this as a Vite app, run `npm run build`, serve `dist/`, and deploy the `/api` functions. The [vercel.json](vercel.json) rewrite proxies `/gh/*` to GitHub so OAuth device-flow sign-in works in production too.

## The workflow

| Coding board | Task board | Meaning |
| --- | --- | --- |
| **Queued** | **To do** | Waiting to be picked up |
| **Active** | **In progress** | Work happening now |
| **Reviewing** | **Review** | Checks, review, or sign-off |
| **Deployed** | **Done** | Completed in the last 14 days |
| **Deferred** | **On hold** | Parked and hidden by default |

Every item carries a low/medium/high **risk** or **priority**, **effort** (including X-High), a customizable **category**, **tags**, and timestamped **notes**. Coding items also track affected files and paths. Marking a note as a blocker flags the card; resolving the note clears that blocker without losing its history.

## Importing items

Drag a `.json` file anywhere onto the page (or choose **Settings → Import JSON**). Chisel validates every row, previews what it found, calls out normalized values and skipped rows, and lets you choose what to import. See [example-refactors.json](example-refactors.json) for a sample.

The parser is deliberately forgiving:

- Accepts a top-level array, or an object with an `items` / `tasks` / `refactorings` / `entries` array.
- Titles from `title`, `name`, or `summary`; descriptions from `description`, `details`, `body`, or `rationale`.
- Risk or priority from `risk` / `priority` / `severity` / `impact` (words or numbers), effort from `effort` / `size` / `estimate` / `points`, category from `category` / `type` / `kind` (with fuzzy matching), and stage from `status` / `stage` / `state` (`todo`, `in-progress`, `review`, `done`, …).
- Files from `files` / `file` / `paths` / `path` / `modules`; tags from `tags` / `labels`.
- `blocked` / `blocked_reason` mark an item blocked on import.

Only a title is required — everything else gets sensible defaults.

An exported project can be imported again without losing its project type or custom categories. If the file belongs to a different board type, Chisel switches to a matching project in the active workspace or creates one for the import.

Use **Settings → Export workspace** for a complete, versioned backup containing every project, category, and skill in the active workspace. **Import workspace** always creates and activates a separate copy with fresh internal IDs; it never overwrites existing data. Workspace export files can also be dragged onto the page.

## Skills

Skills are reusable Markdown prompts for AI coding agents. Open **Settings → Skills** to edit a prompt, copy it, or download it as a `.md` file. Chisel appends the current board's categories and JSON schema automatically, so the agent's response can be dropped straight into the importer.

The included skills cover a general refactoring audit, dead-code discovery, and test-gap discovery. Skills belong to the active workspace and are included in browser persistence, cloud sync, and workspace exports.

## Features

- Create, rename, delete, and switch between workspaces, each containing independent Coding and Task projects.
- Drag cards between stages and reorder them within a column.
- Edit metadata, add notes, and mark or resolve blockers in the detail drawer.
- Search titles, descriptions, files, and tags; filter by risk/priority or blocked state.
- Add, rename, remove, and assign glyphs to categories from **Settings → Categories**.
- Export either the active project or the complete active workspace as round-trippable JSON.
- Keep guest data in `localStorage`, or sign in with GitHub to sync workspaces across devices through Vercel and Neon Postgres.

Built with React + TypeScript + Vite. No UI framework, no state library — one reducer, one stylesheet.
