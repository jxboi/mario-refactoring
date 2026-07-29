import {useEffect,useLayoutEffect,useMemo,useRef,useState} from "react";
import type {CSSProperties} from "react";
import type {GitHubUser} from "../lib/auth";
import type {Project} from "../types";
import type {ActivityEvent,ActivityFamily,ActivityPage} from "../lib/activity";
import {fetchActivityPage} from "../lib/activityApi";
import {fetchGuestActivity,subscribeGuestActivity} from "../lib/guestActivity";
import {getCachedActivity,invalidateActivityCache,loadActivity,type ActivityRequest} from "../lib/activityCache";

interface Props{workspaceId:string;projects:Project[];projectId?:string|null;isGuest:boolean;user:GitHubUser;syncKey?:string|null;onOpen:(event:ActivityEvent)=>void;onRefreshingChange:(refreshing:boolean)=>void;}
const FAMILY_LABELS:Record<ActivityFamily,string>={status:"Status Changed",updates:"Details Updated",notes:"Note Updated",organization:"Organization"};
const NOTE_LABELS:Record<string,string>={"note.added":"Note Added","note.deleted":"Note Removed","note.edited":"Note Edited","note.colored":"Note Changed"};
const ORGANIZATION_LABELS:Record<string,string>={"task.created":"Task Created","task.deleted":"Task Deleted"};
const EMPTY:ActivityPage={events:[],nextCursor:null,projects:[],summary:{today:0,thisWeek:0,itemsTouched:0}};
const stageLabel=(value:string)=>({queued:"To Do",active:"In Progress",reviewing:"Review",deployed:"Done",deferred:"On Hold"}[value]??value);
const stageClass=(field:string,value?:string)=>field==="status"&&value&&["queued","active","reviewing","deployed","deferred"].includes(value)?`timeline-status-${value}`:undefined;
const pascalCase=(value:string)=>value.split(/[^a-zA-Z0-9]+/).filter(Boolean).map(part=>part.charAt(0).toUpperCase()+part.slice(1).toLowerCase()).join("");
const PASCAL_VALUE_FIELDS=new Set(["risk","effort","tags","category","color","groupId"]);
const TEXT_CHANGE_FIELDS=new Set(["title","description","note","body","label","name"]);
const displayValue=(field:string,value?:string)=>{if(value===undefined)return"";if(!value)return"None";if(field==="status")return stageLabel(value);if(!PASCAL_VALUE_FIELDS.has(field))return value;return field==="tags"?value.split(",").map(part=>pascalCase(part.trim())).filter(Boolean).join(", "):pascalCase(value);};
const titleCase=(value:string)=>value.replace(/[-_]/g," ").replace(/\b\w/g,letter=>letter.toUpperCase());
const fieldLabel=(item:ActivityEvent,field:string)=>field==="description"?(item.entityType==="project"?"Outcome & context":"Details"):titleCase(field);
const activityLabel=(item:ActivityEvent)=>{if(item.family==="notes")return NOTE_LABELS[item.action]??FAMILY_LABELS.notes;if(item.family==="organization")return ORGANIZATION_LABELS[item.action]??FAMILY_LABELS.organization;if(item.family!=="updates")return FAMILY_LABELS[item.family];const fields=[...new Set(item.changes.map(change=>fieldLabel(item,change.field)))];return fields.length===1?`${fields[0]} Updated`:fields.length===2?`${fields[0]} & ${fields[1]} Updated`:fields.length>2?`${fields.length} Fields Updated`:FAMILY_LABELS.updates};
const dayKey=(timestamp:number)=>new Date(timestamp).toDateString();
const dayLabel=(timestamp:number)=>{const date=new Date(timestamp),today=new Date(),yesterday=new Date(Date.now()-86400000);if(date.toDateString()===today.toDateString())return"Today";if(date.toDateString()===yesterday.toDateString())return"Yesterday";return date.toLocaleDateString([], {weekday:"long",month:"long",day:"numeric",year:date.getFullYear()===today.getFullYear()?undefined:"numeric"});};
const uppercaseDayPeriod=(value:string)=>value.replace(/\b(am|pm)\b/gi,period=>period.toUpperCase());

function alignDayLabels(scroller:HTMLElement){
 const days=Array.from(scroller.querySelectorAll<HTMLElement>(".timeline-day"));
 if(!window.matchMedia("(min-width: 681px)").matches){for(const day of days)day.querySelector<HTMLElement>(".timeline-day-label")?.style.removeProperty("--timeline-day-offset");return}
 for(const day of days){
  const label=day.querySelector<HTMLElement>(".timeline-day-label"),card=day.querySelector<HTMLElement>(".timeline-card");
  if(!label||!card)continue;
  label.style.setProperty("--timeline-day-offset",`${Math.max(0,(card.offsetHeight-label.offsetHeight)/2)}px`);
 }
}

export function Timeline({workspaceId,projects,projectId=null,isGuest,user,syncKey,onOpen,onRefreshingChange}:Props){
 const[retryKey,setRetryKey]=useState(0);
 const forceNextLoad=useRef(false);
 const timelineRef=useRef<HTMLElement>(null);
 const request=useMemo<ActivityRequest>(()=>({mode:isGuest?"guest":"signed",userKey:String(user.id),workspaceId,projectId,revision:syncKey}),[isGuest,user.id,workspaceId,projectId,syncKey]);
 const[page,setPage]=useState<ActivityPage>(()=>getCachedActivity(request)??EMPTY),[loading,setLoading]=useState(()=>!getCachedActivity(request)),[refreshing,setRefreshing]=useState(false),[loadingMore,setLoadingMore]=useState(false),[error,setError]=useState<string|null>(null);
 useEffect(()=>onRefreshingChange(refreshing),[refreshing,onRefreshingChange]);
 useEffect(()=>()=>onRefreshingChange(false),[onRefreshingChange]);
 useEffect(()=>{let cancelled=false;const cached=getCachedActivity(request),force=forceNextLoad.current;forceNextLoad.current=false;setPage(cached??EMPTY);setLoading(!cached);setRefreshing(Boolean(cached));setError(null);void loadActivity(request,force).then(result=>{if(!cancelled)setPage(result)}).catch(reason=>{if(!cancelled)setError(reason instanceof Error?reason.message:"Could not load activity.")}).finally(()=>{if(!cancelled){setLoading(false);setRefreshing(false)}});return()=>{cancelled=true}},[request,retryKey]);
 useEffect(()=>{if(!isGuest)return;let cancelled=false;const unsubscribe=subscribeGuestActivity(workspaceId,()=>{invalidateActivityCache("guest",workspaceId);setRefreshing(true);void loadActivity(request,true).then(result=>{if(!cancelled)setPage(result)}).catch(reason=>{if(!cancelled)setError(reason instanceof Error?reason.message:"Could not refresh activity.")}).finally(()=>{if(!cancelled)setRefreshing(false)})});return()=>{cancelled=true;unsubscribe()}},[isGuest,workspaceId,request]);
 const groups=useMemo(()=>{const result:{key:string;label:string;timestamp:number;events:ActivityEvent[]}[]=[];for(const item of page.events){const key=dayKey(item.occurredAt),last=result[result.length-1];if(last?.key===key)last.events.push(item);else result.push({key,label:dayLabel(item.occurredAt),timestamp:item.occurredAt,events:[item]});}return result},[page.events]);
 const eventOrder=useMemo(()=>new Map(page.events.map((item,index)=>[item.id,index])),[page.events]);
 useLayoutEffect(()=>{const scroller=timelineRef.current;if(!scroller)return;let frame:number|undefined;const update=()=>{frame=undefined;alignDayLabels(scroller)},schedule=()=>{if(frame===undefined)frame=requestAnimationFrame(update)};update();const observer=new ResizeObserver(schedule);observer.observe(scroller);for(const day of scroller.querySelectorAll(".timeline-day"))observer.observe(day);window.addEventListener("resize",schedule);return()=>{if(frame!==undefined)cancelAnimationFrame(frame);observer.disconnect();window.removeEventListener("resize",schedule)}},[groups]);
 const canOpenEvent=(item:ActivityEvent)=>{
  if(item.deleted)return false;
  const entityType=item.parentEntityType??item.entityType,entityId=item.parentEntityId??item.entityId;
  if(entityType==="project")return projects.some(project=>project.id===entityId);
  if(entityType==="task")return projects.some(project=>project.tasks.some(task=>task.id===entityId));
  if(item.entityType==="note")return projects.some(project=>project.notes.some(note=>note.id===item.entityId)||project.tasks.some(task=>task.notes.some(note=>note.id===item.entityId)));
  return false;
 };
 const loadMore=async()=>{if(!page.nextCursor)return;setLoadingMore(true);try{const next=isGuest?await fetchGuestActivity(workspaceId,{projectId,cursor:page.nextCursor}):await fetchActivityPage({workspaceId,projectId,cursor:page.nextCursor});setPage(current=>({...next,events:[...current.events,...next.events],projects:current.projects.length?current.projects:next.projects,summary:current.summary}));}catch(reason){setError(reason instanceof Error?reason.message:"Could not load earlier activity.");}finally{setLoadingMore(false)}};
 const retry=()=>{forceNextLoad.current=true;setRetryKey(value=>value+1)};
 return <main className="timeline-page" ref={timelineRef}><section className="timeline-shell" aria-busy={loading||refreshing}>
  {error&&page.events.length>0&&<div className="timeline-refresh-error" role="status"><span>!</span><div><strong>Timeline couldn’t update</strong><small>Showing your latest cached activity.</small></div><button type="button" onClick={retry}>Try again</button></div>}
  {error&&!page.events.length&&!loading?<TimelineError message={error} onRetry={retry}/>:loading?<TimelineSkeleton/>:!page.events.length?<div className="timeline-state timeline-empty"><span aria-hidden="true">◇</span><strong>Your timeline starts here</strong><p>New workspace and project changes will appear here. Existing history was intentionally not reconstructed.</p></div>:<div className="timeline-groups">{groups.map(group=><section className="timeline-day" key={group.key}><header className="timeline-day-label"><h2>{group.label}</h2><time dateTime={new Date(group.timestamp).toISOString()}>{group.events.length} {group.events.length===1?"change":"changes"}</time></header><div className="timeline-list">{group.events.map(item=><TimelineCard key={item.id} item={item} actor={user} isGuest={isGuest} showProject={!projectId} canOpen={canOpenEvent(item)} entryDelay={Math.min(eventOrder.get(item.id)??0,8)*70} onOpen={onOpen}/>)}</div></section>)}{page.nextCursor&&<div className="timeline-more-wrap"><span>There’s more to the story</span><button className="btn btn-ghost timeline-more" disabled={loadingMore} onClick={()=>void loadMore()}>{loadingMore?"Loading earlier activity…":"Load earlier activity"}</button></div>}</div>}
 </section></main>
}

function TimelineSkeleton(){return <div className="timeline-skeleton" role="status"><span className="sr-only">Loading the story so far…</span>{[0,1,2].map(item=><div key={item}><span/><section><i/><i/><i/></section></div>)}</div>}
function TimelineError({message,onRetry}:{message:string;onRetry:()=>void}){return <div className="timeline-state timeline-error" role="alert"><span aria-hidden="true">!</span><strong>Activity could not be loaded</strong><p>{message}</p><button type="button" className="btn btn-ghost" onClick={onRetry}>Try again</button></div>}
function TimelineCard({item,actor,isGuest,showProject,canOpen,entryDelay,onOpen}:{item:ActivityEvent;actor:GitHubUser;isGuest:boolean;showProject:boolean;canOpen:boolean;entryDelay:number;onOpen:(event:ActivityEvent)=>void}){
 const date=new Date(item.occurredAt),time=uppercaseDayPeriod(date.toLocaleTimeString([],{hour:"numeric",minute:"2-digit",hour12:true})),absolute=uppercaseDayPeriod(date.toLocaleString([],{year:"numeric",month:"short",day:"numeric",hour:"numeric",minute:"2-digit",hour12:true}));
 const currentStage=item.changes.find(change=>change.field==="status")?.after,dotStageClass=stageClass("status",currentStage),label=activityLabel(item);
 const onlyChange=item.changes.length===1?item.changes[0]:null,changeAlreadyDescribed=Boolean(onlyChange&&onlyChange.before===undefined&&onlyChange.after===undefined&&label===`${fieldLabel(item,onlyChange.field)} Updated`);
 const textChanges=item.changes.filter(change=>TEXT_CHANGE_FIELDS.has(change.field)&&change.before!==undefined&&change.after!==undefined),inlineChanges=item.changes.filter(change=>!textChanges.includes(change));
 const changes=!changeAlreadyDescribed&&inlineChanges.length>0&&<span className="timeline-changes">{inlineChanges.map((change,index)=><span key={`${change.field}-${index}`} title={change.before!==undefined&&change.after!==undefined?`${displayValue(change.field,change.before)} → ${displayValue(change.field,change.after)}`:undefined}>{item.entityType!=="task"&&!["status","color"].includes(change.field)&&<b>{fieldLabel(item,change.field)}</b>}{change.before!==undefined&&change.after!==undefined?<><del className={stageClass(change.field,change.before)}>{displayValue(change.field,change.before)}</del><i>→</i><ins className={stageClass(change.field,change.after)}>{displayValue(change.field,change.after)}</ins></>:<small>Changed</small>}</span>)}</span>;
 const revisions=textChanges.length>0&&<div className="timeline-text-changes">{textChanges.map((change,index)=><div className="timeline-text-change" key={`${change.field}-${index}`}>{textChanges.length>1&&<strong>{fieldLabel(item,change.field)}</strong>}<div><span>Previous</span><p>{change.before||"Empty"}</p></div><div><span>Current</span><p>{change.after||"Empty"}</p></div></div>)}</div>;
 const content=<><span className={`timeline-dot${dotStageClass?` ${dotStageClass}`:""}`} aria-hidden="true"/><div className="timeline-card-surface"><div className="timeline-card-body"><div className="timeline-card-labels"><span className={`timeline-family-label timeline-family-label-${item.family}`}>{label}</span>{changes}{item.family==="organization"&&!ORGANIZATION_LABELS[item.action]&&<span>{item.entityType.replace("-"," ")}</span>}{item.deleted&&item.action!=="note.deleted"&&<span className="timeline-deleted">Deleted</span>}</div><h3>{item.summary}</h3>{revisions}<div className="timeline-card-meta">{isGuest?<span className="timeline-avatar timeline-avatar-guest">G</span>:<img className="timeline-avatar" src={actor.avatarUrl} alt=""/>}<strong>{isGuest?"Guest":actor.name||actor.login}</strong><span>at</span><time dateTime={date.toISOString()} title={absolute}>{time}</time>{showProject&&item.projectTitle&&<><span className="timeline-meta-dot">·</span><em>{item.projectTitle}</em></>}</div></div>{canOpen&&<button type="button" className="timeline-open" aria-label={`Open ${item.entityType.replace("-"," ")} ${item.entityTitle}`} onClick={()=>onOpen(item)}><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M9.5 3H13v3.5M13 3 7.5 8.5"/><path d="M11.5 8v3a2 2 0 0 1-2 2h-5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h3"/></svg></button>}</div></>;
 return <article className={`timeline-card${canOpen?" timeline-card-has-open":""}${item.deleted?" timeline-card-deleted":""}`} style={{"--timeline-card-stack-delay":`${entryDelay}ms`} as CSSProperties}>{content}</article>
}
