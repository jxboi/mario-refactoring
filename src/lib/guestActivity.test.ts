import {afterEach,describe,expect,it,vi} from "vitest";
import type {ActivityEvent} from "./activity";
import {fetchGuestActivity,resetGuestActivityCacheForTests} from "./guestActivity";

const event:ActivityEvent={
  id:"event-1",workspaceId:"workspace-1",projectId:"project-1",projectTitle:"Launch",
  entityType:"task",entityId:"task-1",entityTitle:"Ship",family:"updates",
  action:"task.updated",summary:"Updated Ship",changes:[],occurredAt:Date.now(),
};

function indexedDbWith(events:ActivityEvent[]){
  const getAll=vi.fn(()=>{
    const request:{result:ActivityEvent[];onsuccess:null|(()=>void);onerror:null|(()=>void)}={result:events,onsuccess:null,onerror:null};
    queueMicrotask(()=>request.onsuccess?.());
    return request;
  });
  const db={
    close:vi.fn(),onversionchange:null as null|(()=>void),
    transaction:vi.fn(()=>({objectStore:()=>({index:()=>({getAll})})})),
  };
  const open=vi.fn(()=>{
    const request:{result:typeof db;onsuccess:null|(()=>void);onerror:null|(()=>void);onupgradeneeded:null|(()=>void);error:null}={result:db,onsuccess:null,onerror:null,onupgradeneeded:null,error:null};
    queueMicrotask(()=>request.onsuccess?.());
    return request;
  });
  return {indexedDB:{open},open,getAll};
}

afterEach(()=>{resetGuestActivityCacheForTests();vi.unstubAllGlobals();});

describe("guest activity loading",()=>{
  it("reuses the workspace history for refreshes and filtered views",async()=>{
    const fake=indexedDbWith([event]);vi.stubGlobal("indexedDB",fake.indexedDB);

    expect((await fetchGuestActivity("workspace-1")).events).toEqual([event]);
    expect((await fetchGuestActivity("workspace-1",{query:"ship"})).events).toEqual([event]);
    expect(fake.open).toHaveBeenCalledTimes(1);
    expect(fake.getAll).toHaveBeenCalledTimes(1);
  });

  it("deduplicates concurrent first reads",async()=>{
    const fake=indexedDbWith([event]);vi.stubGlobal("indexedDB",fake.indexedDB);

    await Promise.all([fetchGuestActivity("workspace-1"),fetchGuestActivity("workspace-1")]);
    expect(fake.open).toHaveBeenCalledTimes(1);
    expect(fake.getAll).toHaveBeenCalledTimes(1);
  });
});
