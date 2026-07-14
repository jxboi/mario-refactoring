import type {GitHubUser} from "./_auth.js";
import {DEFAULT_WORKSPACE_NAME, type AppState, type Workspace} from "../src/lib/store.js";
import {CATEGORY_GROUPS, TASK_CATEGORIES, type Project} from "../src/types.js";

type Sql = ReturnType<typeof import("@neondatabase/serverless").neon>;

export interface ShareRow {
  share_id: string;
  project_id: string;
  owner_user_id: string;
  source_workspace_id: string;
  source_workspace_name: string;
  project: Project;
  categories: Workspace["categories"];
  category_groups: Workspace["categoryGroups"];
  version: number;
  updated_at: string | Date;
  role: "owner" | "editor";
  owner_login: string;
}

export class CollaborationConflict extends Error {
  status = 409;
  constructor() { super("This shared project changed while you were editing. Refresh to load the latest version."); }
}

export async function upsertUserProfile(sql: Sql, userId: string, user: GitHubUser): Promise<void> {
  await sql`insert into user_profiles (user_id, login, name, avatar_url, updated_at)
    values (${userId}, ${user.login}, ${user.name}, ${user.avatarUrl}, now())
    on conflict (user_id) do update set login=excluded.login, name=excluded.name, avatar_url=excluded.avatar_url, updated_at=now()`;
}

function cleanProject(project: Project): Project {
  const {collaboration: _collaboration, ...clean} = project;
  return clean;
}

export async function userShares(sql: Sql, userId: string): Promise<ShareRow[]> {
  return await sql`select sp.*, pm.role, coalesce(profile.login, 'unknown') as owner_login
    from project_members pm
    join shared_projects sp on sp.share_id=pm.share_id
    left join user_profiles profile on profile.user_id=sp.owner_user_id
    where pm.user_id=${userId}
    order by sp.updated_at desc` as ShareRow[];
}

/** Merge canonical shared projects into a user's private board snapshot. */
export async function mergeCollaborations(sql: Sql, userId: string, state: AppState | null): Promise<AppState | null> {
  const shares = await userShares(sql, userId);
  if (!shares.length) return state;
  const workspaces = state ? state.workspaces.map((workspace) => ({...workspace, projects: [...workspace.projects]})) : [{
    id:`cloud:${userId}`, name:DEFAULT_WORKSPACE_NAME, createdAt:Date.now(), projects:[], activeProjectId:null,
    categories:TASK_CATEGORIES.map((item) => ({...item})), categoryGroups:CATEGORY_GROUPS.map((item) => ({...item})), skills:[],
  }];
  for (const share of shares) {
    const project: Project = {...share.project, collaboration: {
      shareId: share.share_id, ownerId: share.owner_user_id, ownerLogin: share.owner_login,
      role: share.role, version: Number(share.version),
    }};
    if (share.role === "owner") {
      const workspace = workspaces.find((candidate) => candidate.id === share.source_workspace_id);
      if (!workspace) continue;
      const index = workspace.projects.findIndex((candidate) => candidate.id === share.project_id);
      if (index >= 0) workspace.projects[index] = project;
      continue;
    }
    const id = `shared:${share.share_id}`;
    const existing = workspaces.find((candidate) => candidate.id === id);
    const sharedWorkspace: Workspace = {
      id,
      name: `${share.owner_login} / ${project.title || "Untitled project"}`,
      createdAt: new Date(share.updated_at).getTime(),
      projects: [project],
      activeProjectId: existing?.activeProjectId === project.id ? project.id : null,
      categories: share.categories,
      categoryGroups: share.category_groups,
      skills: [],
      collaboration: {shareId: share.share_id, ownerLogin: share.owner_login},
    };
    const index = workspaces.findIndex((candidate) => candidate.id === id);
    if (index >= 0) workspaces[index] = sharedWorkspace;
    else workspaces.push(sharedWorkspace);
  }
  const activeWorkspaceId = workspaces.some((workspace) => workspace.id === state?.activeWorkspaceId)
    ? state!.activeWorkspaceId
    : workspaces[0]?.id;
  return activeWorkspaceId ? {workspaces, activeWorkspaceId} : null;
}

/** Persist canonical shared project changes and remove collaborator-only workspaces from private storage. */
export async function prepareCollaborativeSave(sql: Sql, userId: string, state: AppState): Promise<AppState> {
  const shares = await userShares(sql, userId);
  for (const share of shares) {
    const workspace = share.role === "owner"
      ? state.workspaces.find((candidate) => candidate.id === share.source_workspace_id)
      : state.workspaces.find((candidate) => candidate.collaboration?.shareId === share.share_id);
    const project = workspace?.projects.find((candidate) => candidate.id === share.project_id);
    if (!project && share.role === "owner") {
      await sql`delete from project_invitations where share_id=${share.share_id}`;
      await sql`delete from project_members where share_id=${share.share_id}`;
      await sql`delete from shared_projects where share_id=${share.share_id} and owner_user_id=${userId}`;
      continue;
    }
    if (!project) continue;
    const clean = cleanProject(project);
    const projectJson = JSON.stringify(clean);
    const categoriesJson = JSON.stringify(workspace!.categories);
    const groupsJson = JSON.stringify(workspace!.categoryGroups);
    const sourceWorkspaceName = share.role === "owner" ? workspace!.name : share.source_workspace_name;
    const unchanged = projectJson === JSON.stringify(share.project)
      && categoriesJson === JSON.stringify(share.categories)
      && groupsJson === JSON.stringify(share.category_groups)
      && sourceWorkspaceName === share.source_workspace_name;
    if (unchanged) continue;
    if (!project.collaboration && Number(share.version) > 1) throw new CollaborationConflict();
    const expectedVersion = project.collaboration?.version ?? Number(share.version);
    const updated = await sql`update shared_projects set project=${projectJson}::jsonb, categories=${categoriesJson}::jsonb,
      category_groups=${groupsJson}::jsonb, source_workspace_name=${sourceWorkspaceName}, version=version+1, updated_at=now()
      where share_id=${share.share_id} and version=${expectedVersion} returning share_id` as {share_id:string}[];
    if (!updated.length) throw new CollaborationConflict();
  }
  const personal = state.workspaces.filter((workspace) => !workspace.collaboration);
  if (personal.length) {
    const activeWorkspaceId = personal.some((workspace) => workspace.id === state.activeWorkspaceId) ? state.activeWorkspaceId : personal[0].id;
    return {workspaces: personal, activeWorkspaceId};
  }
  return state;
}
