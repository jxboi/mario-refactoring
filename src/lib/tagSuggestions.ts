import type {CategoryDef} from "../types";

const CATEGORY_TAGS: Record<string,string[]> = {
  goal:["strategy","outcome","milestone"],
  initiative:["roadmap","cross-team","milestone"],
  feature:["product","user-facing","release"],
  improvement:["optimization","tech-debt","quality"],
  request:["customer-request","stakeholder","intake"],
  incident:["production","urgent","postmortem"],
  bug:["defect","regression","needs-triage"],
  "follow-up":["action-item","follow-up","pending"],
  documentation:["docs","knowledge-base","how-to"],
  design:["ux","ui","prototype"],
  question:["needs-answer","discussion","clarification"],
  research:["discovery","spike","analysis"],
  other:["backlog","general","needs-triage"],
};

const GROUP_TAGS: Record<string,string[]> = {
  planning:["planning","roadmap","milestone"],
  work:["action-item","delivery","needs-triage"],
  general:["general","backlog","discussion"],
};

export function tagSuggestions(categoryId:string,categories:CategoryDef[]):string[]{
  const category=categories.find(c=>c.id===categoryId);
  if(CATEGORY_TAGS[categoryId])return CATEGORY_TAGS[categoryId];
  const categoryTag=(category?.label??categoryId).toLowerCase().trim().replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"");
  return [...new Set([categoryTag,...(GROUP_TAGS[category?.groupId??""]??["general","backlog"])])].filter(Boolean).slice(0,3);
}
