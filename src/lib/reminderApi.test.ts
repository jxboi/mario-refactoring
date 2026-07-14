import{afterEach,describe,expect,it,vi}from"vitest";
import{clearReminderCache,fetchTaskReminder,prefetchProjectReminders}from"./reminderApi";
import type{TaskReminder}from"./reminders";

const reminder:TaskReminder={id:"reminder",workspaceId:"workspace",projectId:"project",taskId:"task",remindAt:"2026-07-15T02:00:00.000Z",createdAt:"2026-07-14T01:00:00.000Z",updatedAt:"2026-07-14T01:00:00.000Z"};

afterEach(()=>{clearReminderCache();vi.unstubAllGlobals()});

describe("reminder project cache",()=>{it("fetches a project once and serves task lookups from memory",async()=>{const fetchMock=vi.fn(async()=>new Response(JSON.stringify({reminders:[reminder]}),{status:200,headers:{"Content-Type":"application/json"}}));vi.stubGlobal("fetch",fetchMock);await prefetchProjectReminders("workspace","project");await expect(fetchTaskReminder({workspaceId:"workspace",projectId:"project",taskId:"task"})).resolves.toEqual(reminder);await expect(fetchTaskReminder({workspaceId:"workspace",projectId:"project",taskId:"missing"})).resolves.toBeNull();expect(fetchMock).toHaveBeenCalledTimes(1)})});
