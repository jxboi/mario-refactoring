import {authenticateUserId,queryValue,type ApiResponse} from "./_auth.js";
import {ensureSchema,getQuery} from "./_db.js";
import {errorStatus,readJson,sendError,type BodyRequest} from "./_http.js";
import {dispatchSchedulableReminders} from "./_reminderQueue.js";
import {deliverDueRemindersForUser} from "./_reminderDelivery.js";
import type {TaskAlert} from "../src/lib/reminders.js";

interface AlertRow{id:string;reminder_id:string;workspace_id:string;project_id:string;task_id:string;workspace_title:string;project_title:string;task_title:string;triggered_at:string|Date;read_at:string|Date|null}
const iso=(value:string|Date)=>value instanceof Date?value.toISOString():String(value);
const map=(row:AlertRow):TaskAlert=>({id:row.id,reminderId:row.reminder_id,workspaceId:row.workspace_id,projectId:row.project_id,taskId:row.task_id,workspaceTitle:row.workspace_title,projectTitle:row.project_title,taskTitle:row.task_title,triggeredAt:iso(row.triggered_at),readAt:row.read_at?iso(row.read_at):null});
function encodeCursor(row:AlertRow):string{return Buffer.from(JSON.stringify({at:iso(row.triggered_at),id:row.id})).toString("base64url")}
function decodeCursor(value:string):{at:string;id:string}|null{try{const parsed=JSON.parse(Buffer.from(value,"base64url").toString("utf8"));return typeof parsed?.at==="string"&&typeof parsed?.id==="string"?parsed:null}catch{return null}}

export default async function handler(req:BodyRequest,res:ApiResponse){res.setHeader("Cache-Control","no-store");try{
  if(req.method!=="GET"&&req.method!=="PATCH"){res.setHeader("Allow","GET, PATCH");sendError(res,405,"Method not allowed.");return;}
  const userId=await authenticateUserId(req);await ensureSchema();const sql=getQuery();
  if(req.method==="PATCH"){
    const body=await readJson(req) as Record<string,unknown>|null,action=body?.action;
    if(action==="read-all")await sql`update task_alerts set read_at=coalesce(read_at,now()) where user_id=${userId} and read_at is null`;
    else if(action==="read"&&typeof body?.alertId==="string")await sql`update task_alerts set read_at=coalesce(read_at,now()) where id=${body.alertId} and user_id=${userId}`;
    else throw Object.assign(new Error("Unknown alert action."),{status:400});
    res.status(200).json({ok:true});return;
  }
  // Materialize due alerts synchronously so the feed remains reliable when a
  // queue credential expires or a consumer is temporarily unavailable.
  await deliverDueRemindersForUser(userId);
  void dispatchSchedulableReminders(userId);
  const limit=Math.min(50,Math.max(1,Number(queryValue(req.query,"limit"))||25)),cursorValue=queryValue(req.query,"cursor"),cursor=cursorValue?decodeCursor(cursorValue):null;
  if(cursorValue&&!cursor)throw Object.assign(new Error("Invalid alert cursor."),{status:400});
  const cursorAt=cursor?.at??null,cursorId=cursor?.id??null;
  const [rows,counts]=await Promise.all([
    sql`select id,reminder_id,workspace_id,project_id,task_id,workspace_title,project_title,task_title,triggered_at,read_at from task_alerts where user_id=${userId}
      and (${cursorAt}::timestamptz is null or (triggered_at,id)<(${cursorAt}::timestamptz,${cursorId})) order by triggered_at desc,id desc limit ${limit+1}` as unknown as Promise<AlertRow[]>,
    sql`select count(*)::int as count from task_alerts where user_id=${userId} and read_at is null` as unknown as Promise<{count:number}[]>,
  ]);
  const hasMore=rows.length>limit,items=rows.slice(0,limit);res.status(200).json({alerts:items.map(map),nextCursor:hasMore?encodeCursor(items[items.length-1]):null,unreadCount:Number(counts[0]?.count)||0});
}catch(error){const status=errorStatus(error);if(status>=500)console.error(error);sendError(res,status,status>=500?"Alerts are unavailable.":(error as Error).message)}}
