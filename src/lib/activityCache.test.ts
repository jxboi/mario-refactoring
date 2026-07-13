import {afterEach,describe,expect,it,vi} from "vitest";
import type {ActivityPage} from "./activity";
import {activityCacheKey,clearActivityCache,getCachedActivity,invalidateActivityCache,isActivityCacheFresh,loadActivity,type ActivityRequest} from "./activityCache";

const page:ActivityPage={events:[],nextCursor:null,projects:[],summary:{today:1,thisWeek:2,itemsTouched:3}};
const request:ActivityRequest={mode:"signed",userKey:"user",workspaceId:"workspace",projectId:null,family:null,query:"",revision:"one"};
afterEach(()=>{clearActivityCache();vi.restoreAllMocks();vi.unstubAllGlobals();});

describe("activity cache",()=>{
 it("uses stable scope and filter keys",()=>{expect(activityCacheKey(request)).toBe(activityCacheKey({...request,revision:"two"}));expect(activityCacheKey({...request,query:" Ship "})).not.toBe(activityCacheKey(request));});
 it("deduplicates in-flight requests and reuses the result",async()=>{let release:(response:Response)=>void=()=>{};const pending=new Promise<Response>(resolve=>{release=resolve});const fetchMock=vi.fn(()=>pending);vi.stubGlobal("fetch",fetchMock);const first=loadActivity(request),second=loadActivity(request);expect(fetchMock).toHaveBeenCalledTimes(1);release(new Response(JSON.stringify(page),{status:200,headers:{"Content-Type":"application/json"}}));expect(await first).toEqual(page);expect(await second).toEqual(page);expect(getCachedActivity(request)).toEqual(page);expect(isActivityCacheFresh(request)).toBe(true);await loadActivity(request);expect(fetchMock).toHaveBeenCalledTimes(1);});
 it("marks cached data stale after a revision or invalidation",async()=>{const fetchMock=vi.fn().mockImplementation(()=>Promise.resolve(new Response(JSON.stringify(page),{status:200,headers:{"Content-Type":"application/json"}})));vi.stubGlobal("fetch",fetchMock);await loadActivity(request);expect(isActivityCacheFresh({...request,revision:"two"})).toBe(false);await loadActivity({...request,revision:"two"});expect(fetchMock).toHaveBeenCalledTimes(2);invalidateActivityCache("signed","workspace");expect(isActivityCacheFresh({...request,revision:"two"})).toBe(false);expect(getCachedActivity(request)).toEqual(page);});
});
