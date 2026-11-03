'use client';
import {useEffect,useRef,useState,useTransition,type FormEvent} from 'react';
import {reworkAction,type ReworkActionResult} from '@/server/actions/rework';
import {OperatorCredentialField} from './operator-confirmation';
import type {ReworkView} from '@/modules/rework/service';

const states:Record<string,string>={DRAFTED:'Tasks drafted — waiting for your review',APPROVED:'Tasks approved — not created yet',REJECTED:'Tasks rejected',ACTIVATED:'Tasks created — coding has not started',UNAVAILABLE:'These tasks cannot currently be confirmed'};
function Field({label,value}:{label:string;value:string}){return value?<p><span className="font-medium">{label}:</span> {value}</p>:null}

/** Presentational: what is planned, in plain words. */
export function DevelopmentTasksContent({rework}:{rework:ReworkView}){
 const a=rework.amendment;
 return <div className="space-y-3">
  {a&&<p role="status" className="font-medium">{states[a.state]??a.state}</p>}
  {a&&a.state==='UNAVAILABLE'&&<p role="alert">{a.message}</p>}
  {!a&&!rework.eligibility.ok&&<div role="alert" className="rounded border p-3"><h5 className="font-medium">Before development tasks can be drafted</h5><ul className="list-disc pl-5">{rework.eligibility.reasons.map((reason,i)=><li key={i}>{reason}</li>)}</ul></div>}
  {a&&a.state!=='ACTIVATED'&&!!a.tasks.length&&<ol aria-label="Drafted tasks" className="space-y-2">{a.tasks.map((task,i)=><li key={i} className="space-y-1 rounded border p-3"><h5 className="font-medium">{i+1}. {task.title}</h5><p>{task.description}</p><Field label="Goal" value={task.objective}/><Field label="How to do it" value={task.guidance}/><Field label="How it will be checked" value={task.validation}/><Field label="Likely files" value={task.filesLikely}/><Field label="Risks" value={task.risks}/></li>)}</ol>}
  {a&&a.state==='ACTIVATED'&&<ol aria-label="Created tasks" className="space-y-1">{a.created.map((task,i)=><li key={i} className="rounded border p-2"><strong>{task.ref||'New task'}</strong> · {task.title} · <span>{task.coding==='AUTHORISED'?(task.status==='PROPOSED'?'Authorised for coding — approve it in Build to start':`Authorised for coding · ${task.status}`):task.status==='PROPOSED'?'Proposed — not yet authorised for coding':task.status}</span></li>)}</ol>}
  {a&&a.state==='ACTIVATED'&&<p>Nothing is built until you authorise a task below. Each authorised task is then built in Build with its own plan, code review and verification, and the feature may need re-verification and acceptance afterwards.</p>}
  {(!a||a.state!=='ACTIVATED')&&<p className="text-sm">Approving tasks records what you authorise. Nothing is created, coded, verified or accepted until the later steps.</p>}
 </div>;
}

export function DevelopmentTasksPanel({productId,featureId,feedbackId,readOnly=false,onState}:{productId:string;featureId:string;feedbackId:string;readOnly?:boolean;onState?:(state:string)=>void}){
 const [rework,setRework]=useState<ReworkView|null>(null),[loaded,setLoaded]=useState(false),[result,setResult]=useState<ReworkActionResult>({status:'success'}),[pending,start]=useTransition();
 const nonce=useRef({payload:'',id:''});
 const report=(next:ReworkView|null)=>onState?.(!next?'NONE':next.amendment?.state??'NONE');
 useEffect(()=>{let active=true;const value=new FormData();value.set('productId',productId);value.set('featureId',featureId);value.set('feedbackId',feedbackId);value.set('operation','LOAD');
  reworkAction(value).then(next=>{if(!active)return;if(next.status==='success'){setRework(next.rework??null);report(next.rework??null)}else setResult(next);setLoaded(true)}).catch(()=>{if(active){setResult({status:'error',message:'Tasks could not load. Reload to retry.'});setLoaded(true)}});return()=>{active=false}},
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [productId,featureId,feedbackId]);
 function submit(event:FormEvent<HTMLFormElement>){event.preventDefault();
  const element=event.currentTarget,value=new FormData(element),submitter=(event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement|null;
  value.set('operation',submitter?.value||String(value.get('operation')));value.set('productId',productId);value.set('featureId',featureId);value.set('feedbackId',feedbackId);
  if(rework?.amendment)value.set('digest',rework.amendment.digest);
  const payload=JSON.stringify([...value.entries()].filter(([key])=>key!=='credential'));if(nonce.current.payload!==payload)nonce.current={payload,id:crypto.randomUUID()};value.set('idempotencyKey',nonce.current.id);
  const input=element.elements.namedItem('credential') as HTMLInputElement|null;if(input)input.value='';
  start(async()=>{try{const next=await reworkAction(value);setResult(next);if(next.status==='success'){nonce.current={payload:'',id:''};if(next.rework!==undefined){setRework(next.rework);report(next.rework)}}}catch{setResult({status:'error',message:'Connection lost. Reload before retrying.'})}finally{value.delete('credential')}});
 }
 const a=rework?.amendment??null,canDraft=!!rework?.eligibility.ok&&(!a||a.state==='REJECTED');
 return <section aria-label="Development tasks" className="space-y-3 rounded-xl border p-4">
  <h3 className="font-semibold">Development tasks</h3>
  {!loaded&&<p role="status">Loading tasks…</p>}
  {pending&&<p role="status" aria-live="polite">Working… drafting tasks can take up to a minute.</p>}
  {result.message&&<p role={result.status==='error'?'alert':'status'}>{result.message}</p>}
  {loaded&&rework&&<DevelopmentTasksContent rework={rework}/>}
  {loaded&&!readOnly&&canDraft&&<form onSubmit={submit} className="space-y-3"><input type="hidden" name="operation" value="DRAFT"/><OperatorCredentialField/><button type="submit" disabled={pending} className="btn btn-primary">{a?'Draft new tasks':'Draft development tasks'}</button></form>}
  {loaded&&!readOnly&&a?.state==='DRAFTED'&&<form key={`${a.digest}:decide`} onSubmit={submit} className="space-y-3"><label className="block text-sm"><input type="checkbox" name="unchangedAck" value="yes" required/> I confirm these tasks keep the approved requirements unchanged.</label><OperatorCredentialField/><div className="flex gap-3"><button type="submit" name="operation" value="APPROVE" disabled={pending} className="btn btn-primary">Approve tasks</button><button type="submit" name="operation" value="REJECT" disabled={pending} formNoValidate className="btn btn-danger">Reject tasks</button></div></form>}
  {loaded&&!readOnly&&a?.state==='ACTIVATED'&&a.created.filter(task=>task.coding==='NOT_AUTHORISED'&&task.reviewedDigest).map(task=><form key={`${task.id}:${task.reviewedDigest}`} onSubmit={submit} className="space-y-3 rounded border p-3"><input type="hidden" name="taskId" value={task.id}/><input type="hidden" name="reviewedDigest" value={task.reviewedDigest??''}/><h5 className="font-medium">Authorise: {task.ref||'New task'} · {task.title}</h5><label className="block text-sm"><input type="checkbox" name="authoriseAck" value="yes" required/> I reviewed this task and authorise the Coding Agent to build it. It will still need its own plan, code review and verification.</label><OperatorCredentialField/><button type="submit" name="operation" value="AUTHORISE_TASK" disabled={pending} className="btn btn-primary">Approve for coding</button></form>)}
  {loaded&&!readOnly&&a?.state==='APPROVED'&&<form key={`${a.digest}:activate`} onSubmit={submit} className="space-y-3"><label className="block text-sm"><input type="checkbox" name="impactAck" value="yes" required/> I understand the feature may need re-verification and acceptance after this.</label><OperatorCredentialField/><button type="submit" name="operation" value="ACTIVATE" disabled={pending} className="btn btn-primary">Create development tasks</button></form>}
 </section>;
}
