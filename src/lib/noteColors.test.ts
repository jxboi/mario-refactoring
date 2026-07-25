import {describe,expect,it} from "vitest";
import {activeProject,newProject,newTask,newWorkspace,normalizeWorkspace,reducer,type AppState} from "./store";

describe("note colors",()=>{
  it("uses neutral for a newly added note",()=>{
    const task=newTask();
    const project={...newProject("Launch"),tasks:[task]};
    const workspace={...newWorkspace(),projects:[project],activeProjectId:project.id};
    const state:AppState={workspaces:[workspace],activeWorkspaceId:workspace.id};
    const next=reducer(state,{type:"note-add",entity:"task",projectId:project.id,taskId:task.id,text:"A note"});

    expect(activeProject(next)?.tasks[0].notes[0].color).toBe("neutral");
  });

  it("sets a note color without creating blocked state",()=>{
    const task={...newTask(),notes:[{id:"note-1",text:"Needs attention",createdAt:1,color:"neutral" as const}]};
    const project={...newProject("Launch"),tasks:[task]};
    const workspace={...newWorkspace(),projects:[project],activeProjectId:project.id};
    const state:AppState={workspaces:[workspace],activeWorkspaceId:workspace.id};
    const next=reducer(state,{type:"note-color",entity:"task",projectId:project.id,taskId:task.id,noteId:"note-1",color:"purple"});

    expect(activeProject(next)?.tasks[0].notes[0].color).toBe("purple");
    expect(activeProject(next)?.tasks[0]).not.toHaveProperty("blocked");
  });

  it("migrates a legacy blocking note to red",()=>{
    const project={...newProject("Launch"),blocked:true,blockReason:"Waiting",notes:[{id:"note-1",text:"Waiting",createdAt:1,blocked:true}],tasks:[]};
    const workspace={...newWorkspace(),projects:[project]};
    const normalized=normalizeWorkspace(workspace)!;

    expect(normalized.projects[0].notes[0]).toMatchObject({text:"Waiting",color:"red"});
    expect(normalized.projects[0]).not.toHaveProperty("blocked");
    expect(normalized.projects[0]).not.toHaveProperty("blockReason");
  });
});
