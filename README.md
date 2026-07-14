# Chisel

A focused workspace for turning projects into actionable tasks.

## Model

Chisel has one deliberately small hierarchy:

**Workspace → Project → Task**

- A workspace opens to a project overview.
- Each project keeps its outcome, priority, effort, tags, status, notes, and task progress.
- Task categories are organized into workspace-level groups that can be reordered and customized.
- Opening a project shows its task Kanban board.
- Tasks move through To do, In progress, Review, Done, and On hold.

There are no typed boards, cross-board ownership links, or Coding project types.

## Project collaboration

Signed-in users can share an individual project from its **Share** button. Invitations target a GitHub username and appear under **Account → Project invitations** for the recipient to accept or decline.

Accepted projects appear in a dedicated shared workspace. Editors can update project details, tasks, stages, and notes, while the owner keeps control of membership, invitations, workspace settings, and project deletion. Only the selected project is shared; other projects in the owner's workspace remain private. Shared updates use optimistic version checks so concurrent edits never silently overwrite newer work.

## Data and migration

Browser and cloud state use the nested v5 model. On first load, v4 state is migrated automatically:

- Plan items become projects.
- Tasks with a valid Plan parent are nested under that project.
- Orphan tasks and all Coding data are removed.
- Old board-container names are discarded.

Workspace exports use format version 4. The import UI intentionally rejects legacy typed workspace exports.

## Development

```bash
npm install
npm run dev
npm test
npm run build
```

The app is built with React, TypeScript, Vite, and Vitest.

GitHub is contacted once during OAuth to exchange the authorization code and load the user's profile. The app then stores a 30-day, HttpOnly signed session and verifies subsequent API requests locally. Configure a strong server-only `SESSION_SECRET`; `GITHUB_CLIENT_SECRET` remains a compatibility fallback. Existing raw-token cookies are upgraded once through the session endpoint after deployment.

## Email automations

Signed-in workspaces can create rules under **Account → Automations**. A rule can watch every project or one project, match an exact or wildcard source stage, and send an email when a task reaches the selected destination stage. Rules and their recent delivery history are stored in Postgres and are intentionally excluded from workspace exports.

The delivery path uses Resend and Vercel Queues. Configure these server-side variables before testing:

```bash
RESEND_API_KEY=re_...
RESEND_FROM_EMAIL="Chisel <notifications@your-verified-domain.example>"
CRON_SECRET=a-random-string-at-least-16-characters
```

Verify the sender domain in Resend before sending to production recipients. For local queue testing, link and pull the Vercel project credentials, then use the Vercel development server:

For an initial sandbox test before domain verification, set `RESEND_FROM_EMAIL="Chisel <onboarding@resend.dev>"`. Resend only allows that sender to deliver to the email address associated with your Resend account; use a verified custom domain for other recipients.

```bash
vercel link
vercel env pull
npm run dev:vercel
```

Deployed queue consumers authenticate with Vercel's request-scoped OIDC token. For direct queue publishing during local development, provide a dedicated `VERCEL_QUEUE_API_TOKEN`; pulled OIDC tokens expire and are intentionally ignored. Reminder alerts still work locally without queue credentials because alert polling materializes due reminders directly from Postgres.

The `/api/automation-dispatch` cron is a daily safety net for outbox rows that could not be published immediately. Queue delivery retries transient email failures automatically; a `sent` run means Resend accepted the message, not that the recipient inbox confirmed delivery.

## Task reminders

Signed-in users can add one private reminder to any active task. Reminder times are entered in the browser's local timezone and stored as UTC. When a reminder fires, it appears in the account-wide alert feed; reminders and alerts are not included in workspace exports or shared with project collaborators.

Reminder delivery reuses Vercel Queues and the authenticated daily dispatcher. Reminders within the queue's 24-hour retention window are queued immediately with delayed delivery. More distant reminders remain in Postgres until the dispatcher moves them inside that window. Alert polling also materializes overdue reminders directly from Postgres, so a transient queue outage cannot suppress an in-app alert. Completing or deleting a task cancels its pending reminders, including every collaborator's private reminder when the task belongs to a shared project.
