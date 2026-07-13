import {describe,expect,it} from "vitest";
import {newProject,newTask,newWorkspace,normalizeWorkspace,reducer,type AppState} from "./store";

describe("grouped task categories",()=>{
  it("migrates project categories into task groups and removes project category values",()=>{
    const project={...newProject("Launch"),category:"initiative",tasks:[newTask()]};
    const raw={...newWorkspace(),projects:[project],categories:{
      project:[{id:"initiative",label:"Initiative",glyph:"◆"},{id:"research",label:"Project research",glyph:"⌕"}],
      task:[{id:"research",label:"Research",glyph:"R"},{id:"other",label:"Other",glyph:"·"}],
    },categoryGroups:undefined};
    const workspace=normalizeWorkspace(raw)!;
    expect("category" in workspace.projects[0]).toBe(false);
    expect(workspace.categories.filter(c=>c.id==="research")).toEqual([{id:"research",label:"Research",glyph:"R",groupId:"general"}]);
    expect(workspace.categories.find(c=>c.id==="initiative")?.groupId).toBe("planning");
  });

  it("deletes a group and reassigns its tasks to Other",()=>{
    const task={...newTask(),category:"bug"},project={...newProject("Launch"),tasks:[task]},workspace={...newWorkspace(),projects:[project]};
    const state:AppState={workspaces:[workspace],activeWorkspaceId:workspace.id};
    const next=reducer(state,{type:"category-group-delete",id:"work"});
    expect(next.workspaces[0].categories.some(c=>c.id==="bug")).toBe(false);
    expect(next.workspaces[0].projects[0].tasks[0].category).toBe("other");
  });

  it("blocks deleting the group that contains Other",()=>{
    const workspace=newWorkspace(),state:AppState={workspaces:[workspace],activeWorkspaceId:workspace.id};
    expect(reducer(state,{type:"category-group-delete",id:"general"})).toEqual(state);
  });

  it("does not restore categories deleted from the current schema",()=>{
    const workspace=newWorkspace();
    workspace.categories=workspace.categories.filter(c=>c.id!=="goal");
    expect(normalizeWorkspace(workspace)!.categories.some(c=>c.id==="goal")).toBe(false);
  });
});
