import {describe, expect, it, vi} from "vitest";
import {CollaborationConflict, mergeCollaborations, prepareCollaborativeSave, type ShareRow} from "./_collaboration.js";
import {newProject, newWorkspace, type AppState} from "../src/lib/store.js";

function share(role:"owner"|"editor"="editor"):ShareRow {
  const workspace=newWorkspace("Product");
  const project={...newProject("Launch"),id:"project-1"};
  return {share_id:"share-1",project_id:project.id,owner_user_id:"github:1",source_workspace_id:"workspace-1",source_workspace_name:"Product",project,categories:workspace.categories,category_groups:workspace.categoryGroups,version:3,updated_at:"2026-07-13T00:00:00.000Z",role,owner_login:"octocat"};
}

function sqlFor(rows:ShareRow[], updateRows:{share_id:string}[]=[{share_id:"share-1"}]) {
  return vi.fn((strings:TemplateStringsArray)=>strings.join(" ").includes("from project_members pm")?Promise.resolve(rows):Promise.resolve(updateRows));
}

describe("project collaboration state",()=>{
  it("isolates an editor's project in a shared workspace",async()=>{
    const personal=newWorkspace("Mine"),state:AppState={workspaces:[personal],activeWorkspaceId:personal.id};
    const merged=await mergeCollaborations(sqlFor([share()]) as never,"github:2",state);
    expect(merged?.workspaces).toHaveLength(2);
    expect(merged?.workspaces[1]).toMatchObject({id:"shared:share-1",collaboration:{shareId:"share-1",ownerLogin:"octocat"}});
    expect(merged?.workspaces[1].projects[0].collaboration).toMatchObject({role:"editor",version:3});
  });

  it("replaces an owner's private copy with the canonical project",async()=>{
    const row=share("owner"),workspace={...newWorkspace("Product"),id:"workspace-1",projects:[{...newProject("Old title"),id:"project-1"}]};
    const merged=await mergeCollaborations(sqlFor([row]) as never,"github:1",{workspaces:[workspace],activeWorkspaceId:workspace.id});
    expect(merged?.workspaces[0].projects[0].title).toBe("Launch");
    expect(merged?.workspaces[0].projects[0].collaboration?.role).toBe("owner");
  });

  it("strips collaborator-only workspaces before private board storage",async()=>{
    const row=share(),personal=newWorkspace("Mine"),shared={...newWorkspace("Shared"),id:"shared:share-1",projects:[{...row.project,title:"Updated",collaboration:{shareId:row.share_id,ownerId:row.owner_user_id,ownerLogin:row.owner_login,role:"editor" as const,version:row.version}}],collaboration:{shareId:row.share_id,ownerLogin:row.owner_login}};
    const sql=sqlFor([row]);
    const prepared=await prepareCollaborativeSave(sql as never,"github:2",{workspaces:[personal,shared],activeWorkspaceId:shared.id});
    expect(prepared.workspaces).toEqual([personal]);
    expect(sql.mock.calls.some(([strings])=>(strings as TemplateStringsArray).join(" ").includes("update shared_projects"))).toBe(true);
  });

  it("rejects a stale shared project version",async()=>{
    const row=share(),shared={...newWorkspace("Shared"),id:"shared:share-1",projects:[{...row.project,title:"Updated",collaboration:{shareId:row.share_id,ownerId:row.owner_user_id,ownerLogin:row.owner_login,role:"editor" as const,version:2}}],collaboration:{shareId:row.share_id,ownerLogin:row.owner_login}};
    await expect(prepareCollaborativeSave(sqlFor([row],[]) as never,"github:2",{workspaces:[shared],activeWorkspaceId:shared.id})).rejects.toBeInstanceOf(CollaborationConflict);
  });
});
