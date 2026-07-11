import {useState} from "react";
import type {CategoryDef,CategoryGroup} from "../types";
import {FALLBACK_CATEGORY_ID} from "../types";

const GLYPH_CHOICES=["⤴","✎","✂","⬡","⚡","✓","▦","❖","✉","⚠","❢","↻","❏","⌕","✐","★","◆","●","▲","❤","⚑","⌘","⎈","·"];

interface Props {
  categories:CategoryDef[]; groups:CategoryGroup[]; counts:Record<string,number>;
  onAdd:(label:string,groupId:string)=>void; onRename:(id:string,label:string)=>void; onSetGlyph:(id:string,glyph:string)=>void;
  onDelete:(id:string)=>void; onMove:(id:string,groupId:string)=>void; onReorder:(id:string,direction:-1|1)=>void;
  onGroupAdd:(label:string)=>void; onGroupRename:(id:string,label:string)=>void; onGroupDelete:(id:string)=>void; onGroupReorder:(id:string,direction:-1|1)=>void;
  onClose:()=>void;
}

export function CategoryManager({categories,groups,counts,onAdd,onRename,onSetGlyph,onDelete,onMove,onReorder,onGroupAdd,onGroupRename,onGroupDelete,onGroupReorder,onClose}:Props){
  const[categoryDraft,setCategoryDraft]=useState("");const[groupDraft,setGroupDraft]=useState("");const[addGroupId,setAddGroupId]=useState(groups[0]?.id??"");
  const[renaming,setRenaming]=useState<{kind:"category"|"group";id:string;label:string}|null>(null);const[glyphId,setGlyphId]=useState<string|null>(null);const[confirm,setConfirm]=useState<{kind:"category"|"group";id:string}|null>(null);
  const addCategory=()=>{const label=categoryDraft.trim();if(label&&addGroupId){onAdd(label,addGroupId);setCategoryDraft("")}};
  const addGroup=()=>{const label=groupDraft.trim();if(label){onGroupAdd(label);setGroupDraft("")}};
  const saveRename=()=>{if(!renaming)return;const label=renaming.label.trim();if(label)(renaming.kind==="category"?onRename:onGroupRename)(renaming.id,label);setRenaming(null)};
  return <div className="modal-veil" onMouseDown={e=>e.target===e.currentTarget&&onClose()}><div className="modal modal-categories">
    <div className="modal-head"><h2>Task categories</h2><button className="icon-btn" onClick={onClose} aria-label="Close">✕</button></div>
    <p className="modal-intro">Categories are shared by tasks in this workspace. Deleting a category moves its tasks to “Other”.</p>
    <div className="cat-manage-list">{groups.map((group,groupIndex)=>{const members=categories.filter(c=>c.groupId===group.id);const containsOther=members.some(c=>c.id===FALLBACK_CATEGORY_ID);return <section className="cat-group" key={group.id}>
      <div className="cat-group-head">{renaming?.kind==="group"&&renaming.id===group.id?<input className="cat-manage-input" autoFocus value={renaming.label} onChange={e=>setRenaming({...renaming,label:e.target.value})} onKeyDown={e=>{if(e.key==="Enter")saveRename();if(e.key==="Escape")setRenaming(null)}} onBlur={saveRename}/>:<strong>{group.label}</strong>}
        <span className="cat-manage-actions always"><button className="cat-manage-action" disabled={groupIndex===0} onClick={()=>onGroupReorder(group.id,-1)} aria-label={`Move ${group.label} up`}>↑</button><button className="cat-manage-action" disabled={groupIndex===groups.length-1} onClick={()=>onGroupReorder(group.id,1)} aria-label={`Move ${group.label} down`}>↓</button><button className="cat-manage-action" onClick={()=>setRenaming({kind:"group",id:group.id,label:group.label})} aria-label={`Rename ${group.label}`}>✎</button><button className="cat-manage-action danger" disabled={containsOther} title={containsOther?"Move Other to another group before deleting":"Delete group and its categories"} onClick={()=>setConfirm({kind:"group",id:group.id})} aria-label={`Delete ${group.label}`}>✕</button></span>
      </div>
      {confirm?.kind==="group"&&confirm.id===group.id?<div className="cat-manage-confirm group-confirm">Delete “{group.label}” and {members.length} categor{members.length===1?"y":"ies"}? Tasks will move to Other.<button className="cat-confirm-yes" onClick={()=>{onGroupDelete(group.id);setConfirm(null)}}>delete</button><button className="cat-confirm-no" onClick={()=>setConfirm(null)}>keep</button></div>:members.map((c,index)=>{const isOther=c.id===FALLBACK_CATEGORY_ID,count=counts[c.id]??0;return <div className="cat-manage-row" key={c.id}>
        <div className="cat-glyph-anchor"><button className="cat-manage-glyph" onClick={()=>setGlyphId(glyphId===c.id?null:c.id)} aria-label={`Change icon for ${c.label}`}>{c.glyph}</button>{glyphId===c.id&&<div className="cat-glyph-picker" role="menu">{GLYPH_CHOICES.map(g=><button key={g} className={`cat-glyph-choice${g===c.glyph?" is-active":""}`} onClick={()=>{onSetGlyph(c.id,g);setGlyphId(null)}}>{g}</button>)}</div>}</div>
        {renaming?.kind==="category"&&renaming.id===c.id?<input className="cat-manage-input" autoFocus value={renaming.label} onChange={e=>setRenaming({...renaming,label:e.target.value})} onKeyDown={e=>{if(e.key==="Enter")saveRename();if(e.key==="Escape")setRenaming(null)}} onBlur={saveRename}/>:confirm?.kind==="category"&&confirm.id===c.id?<span className="cat-manage-confirm">Delete “{c.label}”? {count>0&&<em>{count} task{count===1?"":"s"} → Other</em>}<button className="cat-confirm-yes" onClick={()=>{onDelete(c.id);setConfirm(null)}}>delete</button><button className="cat-confirm-no" onClick={()=>setConfirm(null)}>keep</button></span>:<><span className="cat-manage-label">{c.label}<small>{count||""}</small></span><select className="cat-group-select" value={c.groupId} onChange={e=>onMove(c.id,e.target.value)} aria-label={`Group for ${c.label}`}>{groups.map(g=><option key={g.id} value={g.id}>{g.label}</option>)}</select><span className="cat-manage-actions"><button className="cat-manage-action" disabled={index===0} onClick={()=>onReorder(c.id,-1)} aria-label={`Move ${c.label} up`}>↑</button><button className="cat-manage-action" disabled={index===members.length-1} onClick={()=>onReorder(c.id,1)} aria-label={`Move ${c.label} down`}>↓</button><button className="cat-manage-action" onClick={()=>setRenaming({kind:"category",id:c.id,label:c.label})} aria-label={`Rename ${c.label}`}>✎</button>{!isOther&&<button className="cat-manage-action danger" onClick={()=>setConfirm({kind:"category",id:c.id})} aria-label={`Delete ${c.label}`}>✕</button>}</span></>}
      </div>})}
    </section>})}</div>
    <div className="cat-manage-add"><select className="cat-group-select" value={addGroupId} onChange={e=>setAddGroupId(e.target.value)}>{groups.map(g=><option key={g.id} value={g.id}>{g.label}</option>)}</select><input className="cat-manage-input" placeholder="New category name…" value={categoryDraft} onChange={e=>setCategoryDraft(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addCategory()}/><button className="btn btn-primary btn-sm" disabled={!categoryDraft.trim()||!addGroupId} onClick={addCategory}>＋ Add</button></div>
    <div className="cat-manage-add group-add"><input className="cat-manage-input" placeholder="New group name…" value={groupDraft} onChange={e=>setGroupDraft(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addGroup()}/><button className="btn btn-ghost btn-sm" disabled={!groupDraft.trim()} onClick={addGroup}>＋ Group</button></div>
  </div></div>;
}
