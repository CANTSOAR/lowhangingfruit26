import type { CaseProfile, ClinicalAction, Fact } from "../types";

// Require the same statement in one source. Polarity, amounts and chronology
// remain content; words scattered across unrelated records cannot prove a fact.
const STOP = new Set("the and for with was were has have had are but from that this then than into about also its his her she him they them their there been being just patient reports report reported states stated takes taking take".split(" "));
const WORDNUM: Record<string, string> = {one:"1",two:"2",three:"3",four:"4",five:"5",six:"6",seven:"7",eight:"8",nine:"9",ten:"10",twelve:"12"};
const negative = (text: string) => /\b(no|not|never|without|denies|denied|negative|absent)\b/i.test(text);
function content(text: string): string[] {
  return text.toLowerCase().replace(/\b(?:denies|denied|without)\b/g,"no")
    .replace(/(\d)\s*(mg|mcg|kg|ml|mmhg|bpm|cm|mm)\b/g,"$1 $2")
    .replace(/[^a-z0-9.%><]+/g," ").replace(/(?<![0-9])\.|\.(?![0-9])/g," ")
    .split(/\s+/).filter(Boolean).map(w=>WORDNUM[w]||w).filter(w=>!STOP.has(w));
}
function artifactText(a: CaseProfile["artifacts"][number]): string {
  return [a.body,a.table?[a.table.columns.join(" "),...a.table.rows.map(r=>r.cells.join(" "))].join("\n"):"",a.chart?a.chart.series.map(s=>`${s.name} ${s.points.map(p=>`${p.x} ${p.y}`).join(" ")}`).join("\n"):""].filter(Boolean).join("\n");
}
export interface StartSources {
  sources:{label:string;text:string;tokens:Set<string>}[];
  union:Set<string>;
  startArtifactIds:Set<string>;
}
export function startSources(c: CaseProfile): StartSources {
  const lines=[...c.chartAtStart.map(x=>({label:x.label,text:x.value})),...c.artifacts.filter(a=>a.release.when==="start").map(a=>({label:a.title,text:artifactText(a)}))];
  const sources=lines.map(s=>({...s,tokens:new Set(content(s.text))}));
  return {sources,union:new Set(sources.flatMap(s=>[...s.tokens])),startArtifactIds:new Set(c.artifacts.filter(a=>a.release.when==="start").map(a=>a.id))};
}
function matchingSource(text:string,src:StartSources):string|null {
  const want=content(text);
  if(want.length<3)return null;
  const phrase=` ${want.join(" ")} `;
  for(const source of src.sources) for(const clause of source.text.split(/;|\n|(?<=[a-z])\.\s+/i)) {
    if(negative(clause)!==negative(text))continue;
    if(` ${content(clause).join(" ")} `.includes(phrase))return source.label;
  }
  return null;
}
export function actionStartVisible(a:ClinicalAction,src:StartSources):{visible:boolean;why:string} {
  // An old result linked to an action does not prove a new examination was performed.
  const review=/^(review|read|look at|check)\b/i.test(a.name.trim());
  const live=/\b(measure|take|perform|palpat\w*|inspect\w*|guided|camera|demonstrat\w*|order|administer\w*|recognize)\b/i.test(a.name);
  if(!new Set(["record","vitals","lab","imaging"]).has(a.kind)||!review||live)return {visible:false,why:""};
  const linked=(a.artifactIds||[]).filter(id=>src.startArtifactIds.has(id));
  if(linked.length)return {visible:true,why:`review of start document ${linked.join(",")}`};
  const label=matchingSource(a.result,src);
  return {visible:!!label,why:label?`same result on "${label}"`:""};
}
export function factStartVisible(f:Fact,src:StartSources):{visible:boolean;why:string} {
  const label=matchingSource(f.chart,src);
  return {visible:!!label,why:label?`same statement on "${label}"`:""};
}
export interface StartVisible {actionIds:Set<string>;factIds:Set<string>;why:Record<string,string>}
export function startVisible(c:CaseProfile):StartVisible {
  const src=startSources(c);const out:StartVisible={actionIds:new Set(),factIds:new Set(),why:{}};
  for(const a of c.actions){const r=actionStartVisible(a,src);if(r.visible){out.actionIds.add(a.id);out.why[a.id]=r.why;}}
  for(const f of c.facts){const r=factStartVisible(f,src);if(r.visible){out.factIds.add(f.id);out.why[f.id]=r.why;}}
  return out;
}
