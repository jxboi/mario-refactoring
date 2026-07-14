import {randomUUID} from "node:crypto";
import {authenticateUser, queryValue, type ApiResponse} from "./_auth.js";
import {upsertUserProfile} from "./_collaboration.js";
import {ensureSchema, getQuery} from "./_db.js";
import {errorStatus, readJson, sendError, type BodyRequest} from "./_http.js";
import {loadUserBoard} from "./_automation.js";
import {normalizeAppState} from "../src/lib/store.js";
import {cancelUserShareReminders} from "./_reminders.js";

interface InviteRow { id:string; share_id:string; invitee_login:string; role:"editor"; created_at:string|Date; project_title:string; inviter_login:string; }
interface MemberRow { user_id:string; role:"owner"|"editor"; joined_at:string|Date; login:string; name:string|null; avatar_url:string; }
interface ShareAccessRow { share_id:string; owner_user_id:string; role:"owner"|"editor"; }

const iso = (value:string|Date) => value instanceof Date ? value.toISOString() : String(value);
const loginValue = (value:unknown) => typeof value === "string" ? value.trim().replace(/^@/, "").slice(0, 39) : "";

export default async function handler(req: BodyRequest, res: ApiResponse) {
  res.setHeader("Cache-Control", "no-store");
  try {
    if (req.method !== "GET" && req.method !== "POST") {
      res.setHeader("Allow", "GET, POST"); sendError(res, 405, "Method not allowed."); return;
    }
    const {userId, user} = await authenticateUser(req);
    await ensureSchema();
    const sql = getQuery();
    await upsertUserProfile(sql, userId, user);

    if (req.method === "GET") {
      const projectId = queryValue(req.query, "projectId");
      if (!projectId) {
        const rows = await sql`select i.id, i.share_id, i.invitee_login, i.role, i.created_at,
          coalesce(sp.project->>'title', 'Untitled project') as project_title,
          coalesce(profile.login, 'unknown') as inviter_login
          from project_invitations i join shared_projects sp on sp.share_id=i.share_id
          left join user_profiles profile on profile.user_id=i.inviter_user_id
          where i.status='pending' and (i.invitee_user_id=${userId} or lower(i.invitee_login)=lower(${user.login}))
          order by i.created_at desc` as InviteRow[];
        res.status(200).json({invitations: rows.map((row) => ({id:row.id, shareId:row.share_id, projectTitle:row.project_title, inviterLogin:row.inviter_login, role:row.role, createdAt:iso(row.created_at)}))});
        return;
      }
      const access = await sql`select sp.share_id, sp.owner_user_id, pm.role from shared_projects sp
        join project_members pm on pm.share_id=sp.share_id and pm.user_id=${userId}
        where sp.project_id=${projectId} limit 1` as ShareAccessRow[];
      if (!access.length) {
        const state = normalizeAppState(await loadUserBoard(userId));
        if (!state?.workspaces.some((workspace) => workspace.projects.some((project) => project.id === projectId))) throw Object.assign(new Error("Project not found."), {status:404});
        res.status(200).json({share:null, members:[{userId, login:user.login, name:user.name, avatarUrl:user.avatarUrl, role:"owner"}], invitations:[]});
        return;
      }
      const share = access[0];
      const members = await sql`select pm.user_id, pm.role, pm.joined_at, coalesce(p.login, 'unknown') as login, p.name, coalesce(p.avatar_url, '') as avatar_url
        from project_members pm left join user_profiles p on p.user_id=pm.user_id
        where pm.share_id=${share.share_id} order by case when pm.role='owner' then 0 else 1 end, pm.joined_at` as MemberRow[];
      const invitations = share.role === "owner" ? await sql`select i.id, i.share_id, i.invitee_login, i.role, i.created_at,
        '' as project_title, '' as inviter_login from project_invitations i where i.share_id=${share.share_id} and i.status='pending' order by i.created_at desc` as InviteRow[] : [];
      res.status(200).json({share:{id:share.share_id, role:share.role}, members:members.map((row) => ({userId:row.user_id, login:row.login, name:row.name, avatarUrl:row.avatar_url, role:row.role, joinedAt:iso(row.joined_at)})), invitations:invitations.map((row) => ({id:row.id, login:row.invitee_login, role:row.role, createdAt:iso(row.created_at)}))});
      return;
    }

    const body = await readJson(req) as Record<string, unknown> | null;
    const action = typeof body?.action === "string" ? body.action : "";
    if (action === "invite") {
      const workspaceId = typeof body?.workspaceId === "string" ? body.workspaceId : "";
      const projectId = typeof body?.projectId === "string" ? body.projectId : "";
      const login = loginValue(body?.login);
      if (!workspaceId || !projectId || !/^[a-zd](?:[a-zd-]{0,37}[a-zd])?$/i.test(login)) throw Object.assign(new Error("Enter a valid GitHub username."), {status:400});
      if (login.toLowerCase() === user.login.toLowerCase()) throw Object.assign(new Error("You already own this project."), {status:400});
      const state = normalizeAppState(await loadUserBoard(userId));
      const workspace = state?.workspaces.find((candidate) => candidate.id === workspaceId);
      const project = workspace?.projects.find((candidate) => candidate.id === projectId);
      if (!workspace || !project) throw Object.assign(new Error("Project not found."), {status:404});
      const existing = await sql`select share_id from shared_projects where owner_user_id=${userId} and project_id=${projectId} limit 1` as {share_id:string}[];
      const shareId = existing[0]?.share_id ?? randomUUID();
      if (!existing.length) {
        const {collaboration:_collaboration, ...cleanProject} = project;
        await sql`insert into shared_projects (share_id, project_id, owner_user_id, source_workspace_id, source_workspace_name, project, categories, category_groups)
          values (${shareId}, ${projectId}, ${userId}, ${workspaceId}, ${workspace.name}, ${JSON.stringify(cleanProject)}::jsonb, ${JSON.stringify(workspace.categories)}::jsonb, ${JSON.stringify(workspace.categoryGroups)}::jsonb)`;
        await sql`insert into project_members (share_id, user_id, role) values (${shareId}, ${userId}, 'owner') on conflict do nothing`;
      }
      const profile = await sql`select user_id from user_profiles where lower(login)=lower(${login}) limit 1` as {user_id:string}[];
      if (profile.length) {
        const member = await sql`select 1 from project_members where share_id=${shareId} and user_id=${profile[0].user_id} limit 1` as unknown[];
        if (member.length) throw Object.assign(new Error(`@${login} already collaborates on this project.`), {status:409});
      }
      const id = randomUUID();
      try {
        await sql`insert into project_invitations (id, share_id, inviter_user_id, invitee_login, invitee_user_id)
          values (${id}, ${shareId}, ${userId}, ${login}, ${profile[0]?.user_id ?? null})`;
      } catch (error) {
        if (String(error).toLowerCase().includes("unique")) throw Object.assign(new Error(`An invitation for @${login} is already pending.`), {status:409});
        throw error;
      }
      res.status(201).json({invitation:{id, login, role:"editor", createdAt:new Date().toISOString()}}); return;
    }

    const invitationId = typeof body?.invitationId === "string" ? body.invitationId : "";
    if (action === "accept" || action === "decline") {
      const invitations = await sql`select id, share_id from project_invitations where id=${invitationId} and status='pending'
        and (invitee_user_id=${userId} or lower(invitee_login)=lower(${user.login})) limit 1` as {id:string;share_id:string}[];
      if (!invitations.length) throw Object.assign(new Error("Invitation not found."), {status:404});
      const invitation = invitations[0];
      if (action === "accept") await sql`insert into project_members (share_id, user_id, role) values (${invitation.share_id}, ${userId}, 'editor') on conflict do nothing`;
      await sql`update project_invitations set status=${action === "accept" ? "accepted" : "declined"}, invitee_user_id=${userId}, responded_at=now() where id=${invitation.id}`;
      res.status(200).json({ok:true}); return;
    }

    const shareId = typeof body?.shareId === "string" ? body.shareId : "";
    const access = await sql`select sp.share_id, sp.owner_user_id, pm.role from shared_projects sp join project_members pm on pm.share_id=sp.share_id and pm.user_id=${userId} where sp.share_id=${shareId} limit 1` as ShareAccessRow[];
    if (!access.length) throw Object.assign(new Error("Shared project not found."), {status:404});
    if (action === "revoke") {
      if (access[0].role !== "owner") throw Object.assign(new Error("Only the project owner can revoke invitations."), {status:403});
      await sql`update project_invitations set status='revoked', responded_at=now() where id=${invitationId} and share_id=${shareId} and status='pending'`;
      res.status(200).json({ok:true}); return;
    }
    if (action === "remove-member") {
      if (access[0].role !== "owner") throw Object.assign(new Error("Only the project owner can remove collaborators."), {status:403});
      const memberUserId = typeof body?.userId === "string" ? body.userId : "";
      if (!memberUserId || memberUserId === userId) throw Object.assign(new Error("The project owner cannot be removed."), {status:400});
      await sql`delete from project_members where share_id=${shareId} and user_id=${memberUserId} and role='editor'`;
      await cancelUserShareReminders(memberUserId,shareId);
      res.status(200).json({ok:true}); return;
    }
    if (action === "leave") {
      if (access[0].role === "owner") throw Object.assign(new Error("Project owners cannot leave their own project."), {status:400});
      await sql`delete from project_members where share_id=${shareId} and user_id=${userId}`;
      await cancelUserShareReminders(userId,shareId);
      res.status(200).json({ok:true}); return;
    }
    throw Object.assign(new Error("Unknown collaboration action."), {status:400});
  } catch (error) {
    const status = errorStatus(error);
    if (status >= 500) console.error(error);
    sendError(res, status, status >= 500 ? "Project collaboration is unavailable." : (error as Error).message);
  }
}
