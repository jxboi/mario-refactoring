import type {AppState} from "./store";

// Queue messages can be retained for at most 24 hours. Keep the delayed
// delivery just inside that boundary; later reminders remain durable in SQL
// until the dispatcher moves them into this window.
export const REMINDER_RETENTION_SECONDS=24*60*60;
export const REMINDER_HORIZON_SECONDS=REMINDER_RETENTION_SECONDS-60;
export function reminderDelaySeconds(remindAt:string|Date,now=Date.now()):number{return Math.max(0,Math.ceil((new Date(remindAt).getTime()-now)/1000))}

export interface TaskReminder {
  id: string;
  workspaceId: string;
  projectId: string;
  taskId: string;
  remindAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface TaskAlert {
  id: string;
  reminderId: string;
  workspaceId: string;
  projectId: string;
  taskId: string;
  workspaceTitle: string;
  projectTitle: string;
  taskTitle: string;
  triggeredAt: string;
  readAt: string | null;
}

export interface AlertPage {
  alerts: TaskAlert[];
  nextCursor: string | null;
  unreadCount: number;
}

export interface ReminderCancellation {
  workspaceId: string;
  projectId: string;
  taskId: string;
  shareId: string | null;
}

/** Find task lifecycle changes that invalidate pending reminders. */
export function findReminderCancellations(previous: AppState, next: AppState): ReminderCancellation[] {
  const cancellations = new Map<string, ReminderCancellation>();
  for (const workspace of previous.workspaces) {
    const nextWorkspace = next.workspaces.find((candidate) => candidate.id === workspace.id);
    for (const project of workspace.projects) {
      const nextProject = nextWorkspace?.projects.find((candidate) => candidate.id === project.id);
      for (const task of project.tasks) {
        const nextTask = nextProject?.tasks.find((candidate) => candidate.id === task.id);
        if (nextTask && (task.stage === "deployed" || nextTask.stage !== "deployed")) continue;
        const shareId = project.collaboration?.shareId ?? null;
        const item = {workspaceId: workspace.id, projectId: project.id, taskId: task.id, shareId};
        cancellations.set(`${shareId ?? workspace.id}:${project.id}:${task.id}`, item);
      }
    }
  }
  return [...cancellations.values()];
}
