import {beforeEach,describe,expect,it,vi} from "vitest";
import {clearCollaborationCache,fetchProjectCollaboration,getCachedProjectCollaboration} from "./collaborationApi";

const collaboration={share:null,members:[{userId:"github:1",login:"octocat",name:null,avatarUrl:"",role:"owner" as const}],invitations:[]};

describe("project collaboration cache",()=>{
  beforeEach(()=>{clearCollaborationCache();vi.restoreAllMocks()});

  it("deduplicates concurrent loads and reuses the project snapshot",async()=>{
    const fetchMock=vi.fn(async()=>({ok:true,json:async()=>collaboration}));
    vi.stubGlobal("fetch",fetchMock);
    const[first,second]=await Promise.all([fetchProjectCollaboration("project-1"),fetchProjectCollaboration("project-1")]);
    expect(first).toEqual(collaboration);expect(second).toEqual(collaboration);expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(getCachedProjectCollaboration("project-1")).toEqual(collaboration);
    await fetchProjectCollaboration("project-1");expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
