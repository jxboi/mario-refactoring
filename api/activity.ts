import {authenticateUserId,queryValue,type ApiResponse} from "./_auth.js";
import {ensureSchema,getQuery} from "./_db.js";
import {errorStatus,sendError,type BodyRequest} from "./_http.js";
import {loadUserBoard} from "./_automation.js";
import {normalizeAppState} from "../src/lib/store.js";
import {coalesceActivity,type ActivityEvent,type ActivityFamily,type ActivityProjectOption} from "../src/lib/activity.js";

interface ActivityRow {id:string;event:ActivityEvent;occurred_at:string|Date;}
const FAMILIES=new Set<ActivityFamily>(["status","updates","notes","organization"]);
function encodeCursor(row:ActivityRow):string{return Buffer.from(JSON.stringify({at:row.occurred_at instanceof Date?row.occurred_at.toISOString():String(row.occurred_at),id:row.id})).toString("base64url");}
function decodeCursor(value:string):{at:string;id:string}|null{try{const parsed=JSON.parse(Buffer.from(value,"base64url").toString("utf8"));return typeof parsed?.at==="string"&&typeof parsed?.id==="string"?parsed:null;}catch{return null;}}

export default async function handler(req:BodyRequest,res:ApiResponse){res.setHeader("Cache-Control","no-store");try{
  if(req.method!=="GET"){res.setHeader("Allow","GET");sendError(res,405,"Method not allowed.");return;}
  const userId=await authenticateUserId(req);await ensureSchema();
  const workspaceId=queryValue(req.query,"workspaceId"),projectId=queryValue(req.query,"projectId")||null;
  const rawFamily=queryValue(req.query,"family"),family=FAMILIES.has(rawFamily as ActivityFamily)?rawFamily as ActivityFamily:null;const q=queryValue(req.query,"q").trim().toLowerCase().slice(0,120),pattern=`%${q}%`;const limit=Math.min(50,Math.max(1,Number(queryValue(req.query,"limit"))||50));const cursorValue=queryValue(req.query,"cursor"),cursor=cursorValue?decodeCursor(cursorValue):null;if(cursorValue&&!cursor)throw Object.assign(new Error("Invalid activity cursor."),{status:400});
  const cursorAt=cursor?.at??null,cursorId=cursor?.id??null,sql=getQuery();const rowsPromise=sql`
    select id,event,occurred_at from activity_events
    where user_id=${userId} and workspace_id=${workspaceId}
      and (${projectId}::text is null or project_id=${projectId})
      and (${family}::text is null or family=${family})
      and (${q}::text='' or search_text like ${pattern})
      and (${cursorAt}::timestamptz is null or (occurred_at,id)<(${cursorAt}::timestamptz,${cursorId}))
    order by occurred_at desc,id desc limit ${limit*2+1}
  ` as unknown as Promise<ActivityRow[]>;
  const summariesPromise=sql`select
    count(*) filter(where occurred_at>=date_trunc('day',now()))::int as today,
    count(*) filter(where occurred_at>=now()-interval '7 days')::int as this_week,
    count(distinct entity_type||':'||entity_id)::int as items_touched
    from activity_events where user_id=${userId} and workspace_id=${workspaceId} and (${projectId}::text is null or project_id=${projectId})
  ` as unknown as Promise<{today:number;this_week:number;items_touched:number}[]>;
  const deletedRowsPromise=sql`select distinct on (project_id) project_id,event from activity_events where user_id=${userId} and workspace_id=${workspaceId} and event->>'action'='project.deleted' order by project_id,occurred_at desc` as unknown as Promise<{project_id:string;event:ActivityEvent}[]>;
  const[rawState,rows,summaries,deletedRows]=await Promise.all([loadUserBoard(userId),rowsPromise,summariesPromise,deletedRowsPromise]);
  const state=normalizeAppState(rawState);if(!state)throw Object.assign(new Error("Workspace not found."),{status:404});
  const workspace=state.workspaces.find(item=>item.id===workspaceId);if(!workspace)throw Object.assign(new Error("Workspace not found."),{status:404});
  if(projectId&&!workspace.projects.some(project=>project.id===projectId)&&!deletedRows.some(row=>row.project_id===projectId)){
    const historic=await sql`select 1 from activity_events where user_id=${userId} and workspace_id=${workspaceId} and project_id=${projectId} limit 1` as unknown[];if(!historic.length)throw Object.assign(new Error("Project not found."),{status:404});
  }
  const mapped=rows.map(row=>({...row.event,id:row.id,occurredAt:new Date(row.occurred_at).getTime()}));let events:ActivityEvent[]=[];let consumedCount=0;for(const item of mapped){const candidate=coalesceActivity([...events,item]);if(candidate.length>limit)break;events=candidate;consumedCount++;}const hasMore=consumedCount<rows.length||rows.length===limit*2+1;const nextCursor=hasMore&&consumedCount?encodeCursor(rows[consumedCount-1]):null;
  const projects:ActivityProjectOption[]=workspace.projects.map(project=>({id:project.id,title:project.title||"Untitled project"}));for(const row of deletedRows)if(!projects.some(project=>project.id===row.project_id))projects.push({id:row.project_id,title:row.event.projectTitle??row.event.entityTitle,deleted:true});
  const totals=summaries[0]??{today:0,this_week:0,items_touched:0};res.status(200).json({events,nextCursor,projects,summary:{today:Number(totals.today),thisWeek:Number(totals.this_week),itemsTouched:Number(totals.items_touched)}});
}catch(error){const status=errorStatus(error);if(status>=500)console.error(error);sendError(res,status,status>=500?"Activity history is unavailable.":(error as Error).message);}}
