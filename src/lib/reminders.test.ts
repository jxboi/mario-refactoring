import{describe,expect,it}from"vitest";
import{newProject,newTask,newWorkspace,type AppState}from"./store";
import{findReminderCancellations}from"./reminders";

function state(){const task={...newTask(),id:"task",title:"Follow up"},project={...newProject("Launch"),id:"project",tasks:[task]},workspace={...newWorkspace("Product"),id:"workspace",projects:[project]};return{workspaces:[workspace],activeWorkspaceId:workspace.id} satisfies AppState}

describe("reminder lifecycle",()=>{
 it("cancels when a task is completed but not for ordinary edits",()=>{const before=state(),workspace=before.workspaces[0],project=workspace.projects[0],task=project.tasks[0];const edited={...before,workspaces:[{...workspace,projects:[{...project,tasks:[{...task,title:"New title"}]}]}]};expect(findReminderCancellations(before,edited)).toEqual([]);const completed={...before,workspaces:[{...workspace,projects:[{...project,tasks:[{...task,stage:"deployed"}]}]}]} as AppState;expect(findReminderCancellations(before,completed)).toEqual([{workspaceId:"workspace",projectId:"project",taskId:"task",shareId:null}])});
 it("cancels deleted tasks and carries shared scope",()=>{const before=state(),workspace=before.workspaces[0],project={...workspace.projects[0],collaboration:{shareId:"share",ownerId:"owner",ownerLogin:"owner",role:"editor" as const,version:1}};const shared={...before,workspaces:[{...workspace,projects:[project]}]};const after={...shared,workspaces:[{...workspace,projects:[{...project,tasks:[]}]}]};expect(findReminderCancellations(shared,after)).toEqual([{workspaceId:"workspace",projectId:"project",taskId:"task",shareId:"share"}])});
});
