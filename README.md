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
