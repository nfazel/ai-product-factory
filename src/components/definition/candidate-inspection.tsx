import type {DefinitionCandidateInspection} from '@/modules/requirements/candidate-inspection';
import {DEFINITION_SECTIONS,DEFINITION_SECTION_LABEL} from '@/domain/constants';

const labels:Record<string,string>={tempId:'Proposed item ID',outcomeTempId:'Outcome',capabilityTempId:'Capability',epicTempId:'Epic',featureTempId:'Feature',storyTempId:'Story',fromTempId:'Dependent item',toTempId:'Depends on',successMeasure:'Success measure',targetValue:'Target value',inFirstSlice:'In first slice',persona:'User',need:'User need',value:'User value',measure:'Measure',note:'Reason'};
const reviewFields=new Set(['reviewStatus','edited','committedId','replacesId']);
export function DefinitionCandidateView({candidate:c}:{candidate:DefinitionCandidateInspection}){
 const items=DEFINITION_SECTIONS.flatMap<{tempId:string;title?:string;name?:string}>(section=>{const v=c.proposal[section];return Array.isArray(v)?v:v?[v]:[]});
 const titles=new Map(items.map(item=>[item.tempId,item.title??item.name??item.tempId]));
 const anchor=(id:string)=>`candidate-${c.artifactId}-${id}`;
 return <article className="space-y-6">
  <header className="space-y-3 rounded-xl border p-5">
   <h1 className="text-2xl font-semibold">Immutable definition candidate</h1>
   <p className="text-sm">Published for inspection. Unselected and not formally approved.</p>
   <p className="whitespace-pre-wrap">{c.proposal.assistantSummary}</p>
   <dl className="grid gap-2 text-sm sm:grid-cols-2">
    <div><dt className="font-medium">Candidate ID</dt><dd className="break-all">{c.artifactId}</dd></div>
    <div><dt className="font-medium">Generated</dt><dd><time dateTime={c.generatedAt}>{c.generatedAt}</time></dd></div>
    <div><dt className="font-medium">Origin</dt><dd>AI-generated · {c.provenance.provider} · {c.provenance.model}</dd></div>
    <div><dt className="font-medium">Requirements context</dt><dd>{c.requirements.mode==='UNBOUND_BOOTSTRAP'?'UNBOUND_BOOTSTRAP — initial generation without a baseline':`Baseline v${c.requirements.baseline?.version} · ${c.requirements.baseline?.id}`}</dd></div>
    <div><dt className="font-medium">Requirements applicability</dt><dd>{c.requirements.applicability} — {c.requirements.reason}</dd></div>
   </dl>
   <p className="text-sm text-muted-foreground">This is the original captured content. Current requirements applicability does not establish selection, technical approval or feature acceptance.</p>
  </header>
  <section className="rounded-xl border p-5"><h2 className="text-lg font-semibold">Product problem</h2><p className="mt-2 whitespace-pre-wrap">{c.context.problemStatement}</p><p className="mt-2 text-sm">Brief version {String(c.context.briefVersion??'recorded in capture')}</p></section>
  <p className="text-sm text-muted-foreground">Item links show the proposed outcome → capability → epic → feature → story → acceptance criterion relationships. These are proposed item IDs, not active backlog records.</p>
  {DEFINITION_SECTIONS.map(section=>{
   const value=c.proposal[section],rows=Array.isArray(value)?value:value?[value]:[];
   return <section key={section} className="space-y-3 rounded-xl border p-5"><h2 className="text-lg font-semibold">{DEFINITION_SECTION_LABEL[section]}</h2>
    {rows.length===0?<p className="text-sm text-muted-foreground">None proposed.</p>:rows.map(item=><div id={anchor(item.tempId)} key={item.tempId} className="scroll-mt-6 rounded-lg border p-4">
     <h3 className="font-medium">{titles.get(item.tempId)} <span className="text-sm text-muted-foreground">({item.tempId})</span></h3>
     <dl className="mt-2 space-y-2 text-sm">{Object.entries(item).filter(([key])=>!reviewFields.has(key)).map(([key,val])=><div key={key}>
      <dt className="font-medium">{labels[key]??key.replace(/([A-Z])/g,' $1').replace(/^./,s=>s.toUpperCase())}</dt>
      <dd className="whitespace-pre-wrap">{typeof val==='string'&&['outcomeTempId','capabilityTempId','epicTempId','featureTempId','storyTempId','fromTempId','toTempId'].includes(key)&&titles.has(val)?<a className="underline" href={`#${anchor(val)}`}>{titles.get(val)} ({val})</a>:typeof val==='boolean'?(val?'Yes':'No'):String(val||'Not specified')}</dd>
     </div>)}</dl>
    </div>)}
   </section>;
  })}
  <section className="rounded-xl border p-5"><h2 className="text-lg font-semibold">AI readiness observations</h2><p className="mt-2 whitespace-pre-wrap">{c.proposal.readinessAssessment.summary}</p><ul className="mt-2 list-disc pl-5">{c.proposal.readinessAssessment.notes.map((note,index)=><li key={index}>{note}</li>)}</ul><p className="mt-2 text-sm text-muted-foreground">Proposal commentary only; no formal verification or approval is recorded here.</p></section>
  <details className="rounded-xl border p-5"><summary className="cursor-pointer font-medium">Provenance and integrity details</summary><dl className="mt-3 space-y-2 break-all text-sm">
   {Object.entries({publicationId:c.publicationId,generationId:c.generationId,agentRunId:c.provenance.agentRunId,publishedAt:c.publishedAt,contentDigest:c.contentDigest,revision:c.revision,capturedBaselineDigest:c.requirements.baseline?.digest??'UNBOUND_BOOTSTRAP',currentBaselineId:c.requirements.currentBaseline?.id??'Unversioned or unavailable',sourceCandidate:c.provenance.sourceArtifactId??'Initial proposal'}).map(([key,value])=><div key={key}><dt className="font-medium">{key}</dt><dd>{value}</dd></div>)}
  </dl></details>
 </article>;
}
