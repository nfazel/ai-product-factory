'use client';
import {useEffect,useRef,useState,useTransition,type FormEvent} from 'react';
import {developmentScopeAction,type ScopeActionResult} from '@/server/actions/development-scope';
import type {DevelopmentScopeView} from '@/modules/development-scope/presentation';

const states:Record<string,string>={DRAFT:'Scope drafted — waiting for your review',APPROVED:'Scope approved — no work has started',REJECTED:'Scope rejected',STALE:'Scope is out of date — the feature or proposal changed',UNAVAILABLE:'Scope cannot currently be confirmed'};
const kinds:Record<string,string>={DEFECT:'Issue to fix',ENHANCEMENT:'Enhancement',REQUIREMENT_CHANGE:'Requirement change',NEW_FEATURE:'New feature'};
function List({title,items}:{title:string;items:string[]}){return items.length?<div><h5 className="font-medium">{title}</h5><ul className="list-disc pl-5">{items.map((item,i)=><li key={i}>{item}</li>)}</ul></div>:null}
function Credential(){return <label className="block text-sm">Local operator confirmation<input type="password" name="credential" required autoComplete="off" className="block rounded border p-2"/><span className="text-xs text-muted-foreground">Cleared on submission; never saved.</span></label>}

export function DevelopmentScopeContent({scope}:{scope:DevelopmentScopeView}){
 const c=scope.content,risks=Object.values(c.risks).flat();
 return <div className="space-y-3"><p role="status" className="font-medium">{states[scope.status]??scope.status} · version {scope.version}</p>
  <div className="space-y-2 rounded border p-3"><h4 className="font-medium">{kinds[c.classification]??c.classification}</h4><p>{c.summary}</p>
   <List title="What will change" items={c.changes}/><List title="What must stay the same" items={c.preserve}/><List title="Out of scope" items={c.exclusions}/><List title="Behaviour affected" items={c.affectedBehaviour}/>
   <List title="Extra checks the result must pass" items={c.additionalAcceptanceCriteria}/>
   {!!c.behaviouralTests.length&&<div><h5 className="font-medium">How it will be tested</h5><ul className="list-disc pl-5">{c.behaviouralTests.map((t,i)=><li key={i}>{t.behaviour} — {t.method}; expect: {t.expected}</li>)}</ul></div>}
   <List title="Assumptions" items={c.assumptions}/><List title="Open questions" items={c.unresolvedQuestions}/><List title="Risks" items={risks}/>
   {c.separateFeature&&<p className="rounded border p-2"><strong>Better as a separate feature.</strong> {c.separateFeatureReason}</p>}
  </div>
  {!!scope.blockers.length&&<div role="alert" className="rounded border p-3"><h5 className="font-medium">Before this scope can be approved</h5><ul className="list-disc pl-5">{scope.blockers.map((b,i)=><li key={i}>{b}</li>)}</ul></div>}
  {!!scope.decisions.length&&<ul className="text-sm">{scope.decisions.map(d=><li key={d.id}>{d.type==='APPROVED'?'Approved':'Rejected'}{d.superseded?' (an earlier version)':''} · <time dateTime={d.at}>{d.at}</time></li>)}</ul>}
  <p className="text-sm">Approving scope records what you authorise. It does not create tasks, start coding, verify or accept the feature.</p>
 </div>;
}

export function DevelopmentScopePanel({productId,featureId,feedbackId,readOnly=false}:{productId:string;featureId:string;feedbackId:string;readOnly?:boolean}){
 const [scope,setScope]=useState<DevelopmentScopeView|null>(null),[loaded,setLoaded]=useState(false),[result,setResult]=useState<ScopeActionResult>({status:'success'}),[revising,setRevising]=useState(false),[pending,start]=useTransition();
 const nonce=useRef({payload:'',id:''});
 useEffect(()=>{let active=true;const value=new FormData();value.set('productId',productId);value.set('featureId',featureId);value.set('feedbackId',feedbackId);value.set('operation','LOAD');
  developmentScopeAction(value).then(next=>{if(!active)return;if(next.status==='success')setScope(next.scope??null);else setResult(next);setLoaded(true)}).catch(()=>{if(active){setResult({status:'error',message:'Scope could not load. Reload to retry.'});setLoaded(true)}});return()=>{active=false}},[productId,featureId,feedbackId]);
 function submit(event:FormEvent<HTMLFormElement>){event.preventDefault();
  const element=event.currentTarget,value=new FormData(element),submitter=(event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement|null;
  value.set('operation',submitter?.value||String(value.get('operation')));value.set('productId',productId);value.set('featureId',featureId);value.set('feedbackId',feedbackId);
  if(scope){value.set('scopeId',scope.scopeId);value.set('version',String(scope.version));value.set('digest',scope.digest)}
  const payload=JSON.stringify([...value.entries()].filter(([key])=>key!=='credential'));if(nonce.current.payload!==payload)nonce.current={payload,id:crypto.randomUUID()};value.set('idempotencyKey',nonce.current.id);
  const input=element.elements.namedItem('credential') as HTMLInputElement|null;if(input)input.value='';
  start(async()=>{try{const next=await developmentScopeAction(value);setResult(next);if(next.status==='success'){nonce.current={payload:'',id:''};if(next.scope!==undefined)setScope(next.scope);setRevising(false)}}catch{setResult({status:'error',message:'Connection lost. Reload before retrying.'})}finally{value.delete('credential')}});
 }
 const decidable=scope?.status==='DRAFT';
 return <section aria-label="Development scope" className="space-y-3 rounded-xl border p-4">
  <h3 className="font-semibold">Development scope</h3>
  {!loaded&&<p role="status">Loading scope…</p>}
  {pending&&<p role="status" aria-live="polite">Working… drafting a scope can take up to a minute.</p>}
  {result.message&&<p role={result.status==='error'?'alert':'status'}>{result.message}</p>}
  {loaded&&!scope&&<p>Your confirmed proposal records what you want. The next step is a development scope: a precise, reviewable statement of what the AI is allowed to change.</p>}
  {loaded&&!scope&&!readOnly&&<form onSubmit={submit} className="space-y-3"><input type="hidden" name="operation" value="PREPARE"/><label className="block">Anything the scope should emphasise (optional)<textarea name="instructions" maxLength={20000} rows={2} className="block w-full rounded border p-2"/></label><Credential/><button type="submit" disabled={pending} className="rounded border px-3 py-2">Prepare development scope</button></form>}
  {scope&&<DevelopmentScopeContent scope={scope}/>}
  {scope&&decidable&&!readOnly&&<div className="space-y-3">
   <form key={`${scope.digest}:decide`} onSubmit={submit} className="space-y-3"><label className="block">Review note (optional)<textarea name="reason" maxLength={4000} rows={2} className="block w-full rounded border p-2"/></label><Credential/>
    <div className="flex gap-3"><button type="submit" name="operation" value="APPROVE" disabled={pending||!!scope.blockers.length} className="rounded border px-3 py-2 disabled:opacity-50">Approve scope</button><button type="submit" name="operation" value="REJECT" disabled={pending} className="rounded border px-3 py-2">Reject scope</button></div></form>
   {!revising?<button type="button" disabled={pending} onClick={()=>setRevising(true)}>Revise scope</button>:<form key={`${scope.digest}:revise`} onSubmit={submit} className="space-y-3"><input type="hidden" name="operation" value="REVISE"/><label className="block">What should the scope change?<textarea name="instructions" required maxLength={20000} rows={3} className="block w-full rounded border p-2"/></label><Credential/><div className="flex gap-3"><button type="submit" disabled={pending} className="rounded border px-3 py-2">Send revision</button><button type="button" onClick={()=>setRevising(false)}>Cancel</button></div></form>}
  </div>}
 </section>;
}
