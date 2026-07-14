import {useCallback, useEffect, useRef, useState} from "react";
import {githubConfigured, type GitHubUser} from "../lib/auth";
import {collaborationAction, fetchProjectCollaboration, getCachedProjectCollaboration, type ProjectCollaboration} from "../lib/collaborationApi";
import type {Workspace} from "../lib/store";
import type {Project} from "../types";

interface Props { workspace:Workspace; project:Project; user:GitHubUser; isGuest:boolean; onClose:()=>void; }

const ShareIcon=()=> <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="m8.2 10.8 7.6-4.4M8.2 13.2l7.6 4.4"/></svg>;
const GitHubIcon=()=> <svg viewBox="0 0 16 16" aria-hidden="true" fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z"/></svg>;

export function CollaborationManager({workspace,project,user,isGuest,onClose}:Props){
  const cached=isGuest?undefined:getCachedProjectCollaboration(project.id);
  const initial:ProjectCollaboration|undefined=cached??(!isGuest&&!project.collaboration?{share:null,members:[{userId:`github:${user.id}`,login:user.login,name:user.name,avatarUrl:user.avatarUrl,role:"owner"}],invitations:[]}:undefined);
  const[data,setData]=useState<ProjectCollaboration|null>(initial??null),[login,setLogin]=useState(""),[loading,setLoading]=useState(!isGuest&&!initial),[saving,setSaving]=useState(false),[error,setError]=useState<string|null>(null),[notice,setNotice]=useState<string|null>(null);
  const modalRef=useRef<HTMLElement>(null),closeRef=useRef<HTMLButtonElement>(null);
  const load=useCallback(async()=>{if(isGuest)return;if(!getCachedProjectCollaboration(project.id)&&project.collaboration)setLoading(true);setError(null);try{setData(await fetchProjectCollaboration(project.id))}catch(reason){setError(reason instanceof Error?reason.message:"Could not load collaborators.")}finally{setLoading(false)}},[isGuest,project.id,project.collaboration]);
  useEffect(()=>{void load()},[load]);
  useEffect(()=>{const active=document.activeElement as HTMLElement|null;modalRef.current?.focus();return()=>active?.focus()},[]);
  const handleKeyDown=(event:React.KeyboardEvent)=>{
    if(event.key==="Escape"){event.preventDefault();onClose();return}
    if(event.key!=="Tab")return;
    const focusable=Array.from(modalRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), a[href]')??[]);
    if(!focusable.length)return;
    const first=focusable[0],last=focusable[focusable.length-1];
    if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus()}
    else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus()}
  };
  const act=async(body:Record<string,unknown>,successMessage:string,reloadPage=false)=>{setSaving(true);setError(null);setNotice(null);try{await collaborationAction(body);if(reloadPage)window.location.reload();else{await load();setNotice(successMessage)}}catch(reason){setError(reason instanceof Error?reason.message:"Could not update access.")}finally{setSaving(false)}};
  const invite=async(event:React.FormEvent)=>{event.preventDefault();const value=login.trim().replace(/^@/,"");if(!value)return;setSaving(true);setError(null);setNotice(null);try{await collaborationAction({action:"invite",workspaceId:workspace.id,projectId:project.id,login:value});setLogin("");if(!data?.share)window.location.reload();else{await load();setNotice(`Invitation sent to @${value}.`)}}catch(reason){setError(reason instanceof Error?reason.message:"Could not send invitation.")}finally{setSaving(false)}};
  const owner=data?.share?.role!=="editor",title=project.title||"Untitled project",initialLoading=loading&&!data;
  const accessState=isGuest?"signin":project.collaboration?.role==="editor"?"editor":data?.share?"shared":"private";
  const accessLabel={signin:"Sign in required",editor:"Editor access",shared:"Shared",private:"Private"}[accessState];
  return <div className="modal-veil collaboration-veil" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget)onClose()}}><section ref={modalRef} className="collaboration-modal" role="dialog" aria-modal="true" aria-labelledby="collaboration-title" aria-describedby="collaboration-description" tabIndex={-1} onKeyDown={handleKeyDown}>
    <header className="collaboration-head">
      <div className="collaboration-head-icon"><ShareIcon/></div>
      <div className="collaboration-head-copy"><div className="collaboration-head-meta"><span className="front-kicker">Project access</span><span className={`collaboration-head-state collaboration-head-state-${accessState}`}><i/>{accessLabel}</span></div><h2 id="collaboration-title" title={`Share “${title}”`}>Share “{title}”</h2><p id="collaboration-description">{project.collaboration?.role==="editor"?`Owned by @${project.collaboration.ownerLogin}`:"Invite teammates to work together on this task board."}</p></div>
      <button ref={closeRef} className="icon-btn collaboration-close" onClick={onClose} aria-label="Close collaboration settings"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 4 8 8m0-8-8 8"/></svg></button>
    </header>
    {isGuest?<div className="collaboration-guest">
      <div className="collaboration-guest-mark"><GitHubIcon/></div><span className="collaboration-eyebrow">GitHub collaboration</span><h3>Bring your teammates into the board</h3><p>Sign in to invite people, keep access secure, and sync everyone’s changes.</p>
      <div className="collaboration-benefits" aria-label="Sharing benefits"><span><b>✓</b> One shared project</span><span><b>✓</b> Live updates</span><span><b>✓</b> Owner-managed access</span></div>
      {githubConfigured()?<button className="btn btn-primary collaboration-signin" onClick={()=>window.location.assign("/api/auth/start")}><GitHubIcon/>Continue with GitHub</button>:<button className="btn btn-ghost" onClick={onClose}>Got it</button>}
    </div>:initialLoading?<div className="collaboration-loading" role="status"><div className="collaboration-loading-icon"><ShareIcon/></div><strong>Loading project access</strong><span>Checking members and pending invitations…</span><div className="collaboration-loading-lines"><i/><i/><i/></div></div>:!data?<div className="collaboration-load-error" role="alert"><span>!</span><h3>Couldn’t load project access</h3><p>{error||"Check your connection and try again."}</p><button className="btn btn-ghost" onClick={()=>void load()}>Try again</button></div>:<div className="collaboration-body">
      {error&&<div className="collaboration-message collaboration-message-error" role="alert"><span>!</span><p>{error}</p></div>}
      {notice&&<div className="collaboration-message collaboration-message-success" role="status"><span>✓</span><p>{notice}</p><button onClick={()=>setNotice(null)} aria-label="Dismiss message">×</button></div>}
      {owner&&<form className="collaboration-invite" onSubmit={invite}>
        <div className="collaboration-invite-heading"><div><h3>Invite someone</h3><p>Editors can update project details, tasks, stages, and notes.</p></div><span>Editor access</span></div>
        <label className="field-label" htmlFor="collaboration-login">GitHub username</label>
        <div className="collaboration-invite-row"><div className="collaboration-login-field"><span aria-hidden="true">@</span><input id="collaboration-login" value={login} onChange={event=>setLogin(event.target.value)} placeholder="octocat" autoComplete="off" autoCapitalize="none" spellCheck={false} aria-describedby="collaboration-invite-help" autoFocus/></div><button className="btn btn-primary" disabled={saving||!login.trim()}>{saving?"Sending…":"Send invite"}</button></div>
        <p id="collaboration-invite-help">They’ll receive an invitation in Chisel after signing in with GitHub.</p>
      </form>}
      <section className="collaboration-section"><div className="collaboration-section-title"><div><h3>People with access</h3><span>{data.members.length} {data.members.length===1?"person":"people"}</span></div>{loading&&<small><i/>Syncing…</small>}</div><div className="collaboration-list">{data.members.map(member=><article className="collaboration-person" key={member.userId}>{member.avatarUrl?<img src={member.avatarUrl} alt=""/>:<span className="collaboration-avatar">{member.login.slice(0,1).toUpperCase()}</span>}<div><strong>{member.name||member.login}{member.userId===`github:${user.id}`?<em>you</em>:null}</strong><small>@{member.login}</small></div><span className={`collaboration-role collaboration-role-${member.role}`}>{member.role}</span>{owner&&member.role!=="owner"&&<button className="collaboration-person-action" disabled={saving} onClick={()=>{if(window.confirm(`Remove @${member.login} from this project?`))void act({action:"remove-member",shareId:data.share?.id,userId:member.userId},`@${member.login} no longer has access.`)}}>Remove</button>}</article>)}</div></section>
      {owner&&!!data.invitations.length&&<section className="collaboration-section collaboration-pending"><div className="collaboration-section-title"><div><h3>Pending invitations</h3><span>{data.invitations.length} awaiting response</span></div></div><div className="collaboration-list">{data.invitations.map(invitation=><article className="collaboration-person" key={invitation.id}><span className="collaboration-avatar collaboration-avatar-pending">@</span><div><strong>@{invitation.login}</strong><small>Sent {new Date(invitation.createdAt).toLocaleDateString(undefined,{month:"short",day:"numeric",year:"numeric"})}</small></div><span className="collaboration-role collaboration-role-pending">Pending</span><button className="collaboration-person-action" disabled={saving} onClick={()=>void act({action:"revoke",shareId:data.share?.id,invitationId:invitation.id},`Invitation to @${invitation.login} revoked.`)}>Revoke</button></article>)}</div></section>}
      {!owner&&data.share&&<div className="collaboration-leave"><div><strong>Your access</strong><p>You can edit this project. Only the owner can manage members or delete it.</p></div><button className="btn btn-quiet-danger" disabled={saving} onClick={()=>{if(window.confirm("Leave this shared project?"))void act({action:"leave",shareId:data.share?.id},"",true)}}>{saving?"Leaving…":"Leave project"}</button></div>}
      {owner&&<footer className="collaboration-owner-note"><span aria-hidden="true">◇</span><p>Only this project is shared. Your other workspace projects stay private.</p></footer>}
    </div>}
  </section></div>
}
