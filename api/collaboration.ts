import {randomUUID} from "node:crypto";
import {authenticateUser, queryValue, type ApiResponse} from "./_auth.js";
import {upsertUserProfile} from "./_collaboration.js";
import {ensureSchema, getQuery} from "./_db.js";
import {errorStatus, readJson, sendError, type BodyRequest} from "./_http.js";
import {loadUserBoard} from "./_automation.js";
import {normalizeAppState} from "../src/lib/store.js";

interface InviteRow { id:string; share_id:string; invitee_login:string; role:"editor"; created_at:string|Date; project_title:string; inviter_login:string; }
interface MemberRow { user_id:string; role:"owner"|"editor"; joined_at:string|Date; login:string; name:string|null; avatar_url:string; }
interface ShareAccessRow { share_id:string; owner_user_id:string; role:"owner"|"editor"; }
interface ProjectAccessSnapshotRow extends ShareAccessRow { private_owned:boolean; members:MemberRow[]; invitations:InviteRow[]; }

const iso = (value:string|Date) => value instanceof Date ? value.toISOString() : String(value);
const loginValue = (value:unknown) => typeof value === "string" ? value.trim().replace(/^@/, "").slice(0, 39) : "";

export default async function handler(req: BodyRequest, res: ApiResponse) {
  res.setHeader("Cache-Control", "no-store");
  try {
    if (req.method !== "GET" && req.method !== "POST") {
      res.setHeader("Allow", "GET, POST"); sendError(res, 405, "Method not allowed."); return;
    }
    const {userId, user} = await authenticateUser(req);
    const sql = getQuery();

    if (req.method === "GET") {
      const projectId = queryValue(req.query, "projectId");
      if (!projectId) {
        const loadInvitations = () => sql`select i.id, i.share_id, i.invitee_login, i.role, i.created_at,
          coalesce(sp.project->>'title', 'Untitled project') as project_title,
          coalesce(profile.login, 'unknown') as inviter_login
          from project_invitations i join shared_projects sp on sp.share_id=i.share_id
          left join user_profiles profile on profile.user_id=i.inviter_user_id
          where i.status='pending' and (i.invitee_user_id=${userId} or lower(i.invitee_login)=lower(${user.login}))
          order by i.created_at desc` as unknown as Promise<InviteRow[]>;
        let rows:InviteRow[];try{rows=await loadInvitations()}catch(error){if((error as {code?:string}).code!=="42P01")throw error;await ensureSchema();rows=await loadInvitations()}
        res.status(200).json({invitations: rows.map((row) => ({id:row.id, shareId:row.share_id, projectTitle:row.project_title, inviterLogin:row.inviter_login, role:row.role, createdAt:iso(row.created_at)}))});
        return;
      }
      const loadSnapshot = () => sql`with access as (
          select sp.share_id,sp.owner_user_id,pm.role from shared_projects sp
          join project_members pm on pm.share_id=sp.share_id and pm.user_id=${userId}
          where sp.project_id=${projectId} limit 1
        ), private_access as (
          select 1 from boards b
          cross join lateral jsonb_array_elements(coalesce(b.state->'workspaces','[]'::jsonb)) workspace
          cross join lateral jsonb_array_elements(coalesce(workspace->'projects','[]'::jsonb)) project
          where b.user_id=${userId} and project->>'id'=${projectId} limit 1
        ) select
          (select share_id from access) as share_id,(select owner_user_id from access) as owner_user_id,
          (select role from access) as role,exists(select 1 from private_access) as private_owned,
          coalesce((select jsonb_agg(jsonb_build_object(
            'user_id',pm.user_id,'role',pm.role,'joined_at',pm.joined_at,'login',coalesce(profile.login,'unknown'),
            'name',profile.name,'avatar_url',coalesce(profile.avatar_url,'')
          ) order by case when pm.role='owner' then 0 else 1 end,pm.joined_at)
          from project_members pm left join user_profiles profile on profile.user_id=pm.user_id
          where pm.share_id=(select share_id from access)),'[]'::jsonb) as members,
          coalesce((select jsonb_agg(jsonb_build_object(
            'id',invitation.id,'share_id',invitation.share_id,'invitee_login',invitation.invitee_login,
            'role',invitation.role,'created_at',invitation.created_at,'project_title','','inviter_login',''
          ) order by invitation.created_at desc) from project_invitations invitation
          where invitation.share_id=(select share_id from access) and invitation.status='pending'
            and (select role from access)='owner'),'[]'::jsonb) as invitations` as unknown as Promise<ProjectAccessSnapshotRow[]>;
      let snapshots:ProjectAccessSnapshotRow[];try{snapshots=await loadSnapshot()}catch(error){if((error as {code?:string}).code!=="42P01")throw error;await ensureSchema();snapshots=await loadSnapshot()}
      const snapshot=snapshots[0];
      if (!snapshot?.share_id) {
        if (!snapshot?.private_owned) throw Object.assign(new Error("Project not found."), {status:404});
        res.status(200).json({share:null, members:[{userId, login:user.login, name:user.name, avatarUrl:user.avatarUrl, role:"owner"}], invitations:[]});
        return;
      }
      res.status(200).json({share:{id:snapshot.share_id, role:snapshot.role}, members:snapshot.members.map((row) => ({userId:row.user_id, login:row.login, name:row.name, avatarUrl:row.avatar_url, role:row.role, joinedAt:iso(row.joined_at)})), invitations:snapshot.invitations.map((row) => ({id:row.id, login:row.invitee_login, role:row.role, createdAt:iso(row.created_at)}))});
      return;
    }

    await ensureSchema();
    await upsertUserProfile(sql, userId, user);

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
      res.status(200).json({ok:true}); return;
    }
    if (action === "leave") {
      if (access[0].role === "owner") throw Object.assign(new Error("Project owners cannot leave their own project."), {status:400});
      await sql`delete from project_members where share_id=${shareId} and user_id=${userId}`;
      res.status(200).json({ok:true}); return;
    }
    throw Object.assign(new Error("Unknown collaboration action."), {status:400});
  } catch (error) {
    const status = errorStatus(error);
    if (status >= 500) console.error(error);
    sendError(res, status, status >= 500 ? "Project collaboration is unavailable." : (error as Error).message);
  }
}
