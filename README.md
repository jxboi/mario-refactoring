# Chisel — a calm work cockpit

A focused workspace for taking product intent from planning through tasks to shipped code. Create items by hand, import structured JSON, or use a reusable AI prompt to turn rough ideas into actionable work.

Chisel organizes work as **workspaces → projects → items**. A workspace can hold any mix of three project types:

- **Plan** boards shape goals, initiatives, features, and research before delivery work begins.
- **Task** boards track general work with priority, effort, and task-focused categories.
- **Coding** boards track developer work with priority, effort, affected files, and technical categories.

Items can be linked across adjacent levels inside a workspace: Plan → Task → Coding. Children can have multiple parents, cards show direct-child progress, and parent status always remains under the user's control. Categories are shared between projects of the same type.

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

Chisel gates the board behind an optional GitHub sign-in and keeps each account's boards separate.

1. Create an OAuth App at **GitHub → Settings → Developer settings → OAuth Apps**, and enable **Device Flow**.
2. Copy `.env.example` to `.env` and set `VITE_GITHUB_CLIENT_ID`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, and `GITHUB_REDIRECT_URI`.
3. Run `npm run dev:vercel` and click **Sign in with GitHub** — GitHub will redirect back to the configured callback after authorization.

Sign-in uses GitHub's [web application OAuth flow](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps#web-application-flow). The authorization code is exchanged by the server, and the resulting token is stored in an HttpOnly session cookie. `GITHUB_CLIENT_SECRET` must never be exposed to browser code.

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

Existing `chisel.projects.v2` browser data and legacy cloud board documents migrate automatically into a workspace named **My workspace**. Legacy Refactoring projects become Coding projects, their categories are preserved, and the broader Coding defaults are merged in.

## Deploy to Vercel

After the project is linked and Neon is installed, deploy a preview:

```sh
vercel
```

Deploy to production:

```sh
vercel --prod
```

Vercel should detect this as a Vite app, run `npm run build`, serve `dist/`, and deploy the `/api` functions. Configure the production OAuth callback as `https://your-domain.example/api/auth/callback` and set the server-side GitHub credentials in Vercel environment variables.

## The workflow

| Plan board | Task board | Coding board | Meaning |
| --- | --- | --- | --- |
| **Idea** | **To do** | **Queued** | Waiting to be shaped or picked up |
| **Planning** | **In progress** | **Active** | Work happening now |
| **Ready** | **Review** | **Reviewing** | Ready, checking, or awaiting sign-off |
| **Done** | **Done** | **Deployed** | Completed work |
| **On hold** | **On hold** | **Deferred** | Parked and hidden by default |

Every item carries a low/medium/high **priority**, **effort** (including X-High), a customizable **category**, **tags**, and timestamped **notes**. Coding items also track affected files and paths. The Relationships section creates or attaches downstream work, links parents backward, and navigates between projects.

## Importing items

Drag a `.json` file anywhere onto the page (or choose **Settings → Import JSON**). Chisel validates every row, previews what it found, calls out normalized values and skipped rows, and lets you choose what to import. See [example-refactors.json](example-refactors.json) for a sample.

The parser is deliberately forgiving:

- Accepts a top-level array, or an object with an `items` / `tasks` / `refactorings` / `entries` array.
- Titles from `title`, `name`, or `summary`; descriptions from `description`, `details`, `body`, or `rationale`.
- Risk or priority from `risk` / `priority` / `severity` / `impact` (words or numbers), effort from `effort` / `size` / `estimate` / `points`, category from `category` / `type` / `kind` (with fuzzy matching), and stage from `status` / `stage` / `state` (`todo`, `in-progress`, `review`, `done`, …).
- Files from `files` / `file` / `paths` / `path` / `modules`; tags from `tags` / `labels`.
- `blocked` / `blocked_reason` mark an item blocked on import; `parentIds` restores links when matching compatible parents exist in the destination workspace.

Only a title is required — everything else gets sensible defaults.

An exported project can be imported again without losing its project type or custom categories. If the file belongs to a different board type, Chisel switches to a matching project in the active workspace or creates one for the import.

Use **Settings → Export workspace** for a complete, versioned backup containing every project, category, relationship, and skill in the active workspace. **Import workspace** creates a separate copy and remaps every internal ID without breaking links.

## Skills

Skills are reusable Markdown prompts for AI coding agents. Open **Settings → Skills** to edit a prompt, copy it, or download it as a `.md` file. Chisel appends the current board's categories and JSON schema automatically, so the agent's response can be dropped straight into the importer.

The included skills cover a general refactoring audit, dead-code discovery, and test-gap discovery. Skills belong to the active workspace and are included in browser persistence, cloud sync, and workspace exports.

## Features

- Create, rename, delete, and switch between workspaces containing Plan, Task, and Coding projects.
- Create linked downstream work, attach existing children, link multiple parents, and navigate the full Plan → Task → Coding chain.
- See completed/total direct-child rollups without automatically changing parent status.
- Drag cards between stages and reorder them within a column.
- Edit metadata, add notes, and mark or resolve blockers in the detail drawer.
- Search titles, descriptions, files, and tags; filter by risk/priority or blocked state.
- Add, rename, remove, and assign glyphs to categories from **Settings → Categories**.
- Export either the active project or the complete active workspace as round-trippable JSON.
- Keep guest data in `localStorage`, or sign in with GitHub to sync workspaces across devices through Vercel and Neon Postgres.

Built with React + TypeScript + Vite. No UI framework, no state library — one reducer, one stylesheet.
