'use client';
import {useRef,useState,useTransition,type FormEvent} from 'react';
import type {FeatureReviewView} from '@/modules/feature-review/presentation';
import {FeatureFeedbackPanel} from './feature-feedback';
import {OperatorCredentialField} from './operator-confirmation';
import {featureReviewAction} from '@/server/actions/feature-review';
import type {ActionState} from '@/lib/action-state';
const labels:Record<string,string>={ACCEPTED:'Accepted',DEFERRED:'Review later',REVIEW_REQUIRED:'Review required',AWAITING_ACCEPTANCE:'Awaiting acceptance',UNAVAILABLE:'Verification status unavailable',ARCHIVED:'Archived'};
export function FeatureReviewCard({productId,feature}:{productId:string;feature:FeatureReviewView}){
 const [feedbackOpen,setFeedbackOpen]=useState(false);
 const [state,setState]=useState<ActionState>({status:'idle'}),[pending,start]=useTransition(),[ack,setAck]=useState<string[]>([]);const form=useRef<HTMLFormElement>(null),key=useRef({payload:'',id:''});
 const unavailable=feature.status==='UNAVAILABLE',closed=feature.status==='ARCHIVED';
 function submit(event:FormEvent<HTMLFormElement>){event.preventDefault();const element=event.currentTarget;const origin=window.location;if(origin.protocol!=='https:'&&!['localhost','127.0.0.1','[::1]'].includes(origin.hostname)){setState({status:'error',message:'Open this workspace on localhost or HTTPS before entering operator confirmation.'});return}
  const data=new FormData(element),submitter=(event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement|null;const decision=submitter?.value??'DEFERRED';data.set('decision',decision);if(decision==='DEFERRED')data.delete('concern');const payload=JSON.stringify([...data.entries()].filter(([name])=>name!=='credential'));if(key.current.payload!==payload)key.current={payload,id:crypto.randomUUID()};data.set('idempotencyKey',key.current.id);
  const credential=element.elements.namedItem('credential') as HTMLInputElement|null;if(credential)credential.value='';
  start(async()=>{try{const result=await featureReviewAction({status:'idle'},data);setState(result);if(result.status==='success')key.current={payload:'',id:''}}finally{data.delete('credential')}});
 }
 return <article id={`feature-review-${feature.featureId}`} data-feature-id={feature.featureId} className="rounded-xl border p-4 space-y-3">
  <div className="flex justify-between gap-4"><h3 className="font-semibold">{feature.title}</h3><span>{feature.status==='AWAITING_ACCEPTANCE'&&!feature.eligible?'Awaiting technical verification':labels[feature.status]??feature.status}</span></div>
  <p className="text-xs text-muted-foreground">Feature ID: <code>{feature.featureId}</code></p><p>{feature.summary}</p><p className="text-sm text-muted-foreground">Implementation version: <code className="break-all">{feature.version}</code></p>
  <p className="text-sm">{unavailable?'Technical verification cannot currently be confirmed. Existing review history is preserved.':feature.eligible?'Independent verification and mandatory technical approvals are current.':feature.technical.some(task=>task.verdict==='FAIL')?'Independent technical verification failed. Acceptance is unavailable.':'Independent technical verification or required approvals are not current.'}</p>
  <details open><summary>{feature.requirementsApproved?'Approved requirements':'Requirements — approval pending'}</summary>{feature.requirements.length?<ul className="list-disc pl-5">{feature.requirements.map(r=><li key={r.id}>{r.text}</li>)}</ul>:<p>No approved acceptance criteria are available yet.</p>}</details>
  {!!feature.concerns.length&&<fieldset className="space-y-2"><legend>Non-blocking concerns — acknowledge each before accepting</legend>{feature.concerns.map(c=><label key={c.id} className="block text-sm"><input form={`review-form-${feature.featureId}`} type="checkbox" name="concern" value={c.id} checked={ack.includes(c.id)} onChange={e=>setAck(a=>e.target.checked?[...a,c.id]:a.filter(id=>id!==c.id))}/>{' '}{c.text}</label>)}</fieldset>}
  {!closed&&<form id={`review-form-${feature.featureId}`} ref={form} onSubmit={submit} className="space-y-2">
   <input type="hidden" name="productId" value={productId}/><input type="hidden" name="featureId" value={feature.featureId}/><input type="hidden" name="digest" value={feature.digest}/>
   <OperatorCredentialField note="Use the protected local operator credential. It is cleared on submission and is not saved with the review."/>
   <label className="block text-sm">Review note (optional)<textarea name="reason" maxLength={2000} className="block rounded border p-2"/></label>
   <div className="flex gap-3"><button type="submit" name="decision" value="ACCEPTED" disabled={!feature.eligible||pending||!feature.concerns.every(concern=>ack.includes(concern.id))||feature.status==='ACCEPTED'} className="btn btn-primary">Accept Feature</button><button type="submit" name="decision" value="DEFERRED" disabled={pending||feature.status==='ACCEPTED'} className="btn btn-secondary">Review Later</button><button type="button" onClick={()=>setFeedbackOpen(true)} className="btn btn-secondary">Request Changes</button></div>
   <p className="text-xs">Acceptance is a business decision for this verified version. It also records your approval of each task&apos;s verification, so you do not need to approve them one by one first. Review Later does not stop other development.</p>
  </form>}
  {closed&&<button type="button" onClick={()=>setFeedbackOpen(true)} className="btn btn-secondary">Feedback history</button>}
  {feedbackOpen&&<FeatureFeedbackPanel key={`${productId}:${feature.featureId}`} productId={productId} featureId={feature.featureId} title={feature.title} onClose={()=>setFeedbackOpen(false)} readOnly={closed}/>}
  {state.message&&<p role={state.status==='error'?'alert':'status'}>{state.message}</p>}
  <details><summary>Technical governance details</summary><ul>{feature.blockers.map(b=><li key={b}>{b}</li>)}</ul><ul>{feature.technical.map(t=><li key={t.taskId}>{t.taskId}: {t.verdict} · {t.current?'Current approval':'Not current'} · Mandatory controls {t.mandatoryPassed?'passed':'incomplete'}</li>)}</ul><p>Review reference: <code>{feature.digest}</code></p></details>
  <details><summary>Review history ({feature.history.length})</summary>{feature.history.length?<ol>{feature.history.map(h=><li key={h.id}>{h.decision} · {h.actor} · <time dateTime={h.at}>{h.at}</time>{h.reason&&<p>{h.reason}</p>}{h.version&&<p className="text-xs break-all">Version: {h.version} · Review reference: {h.digest}</p>}</li>)}</ol>:<p>No formal review decisions recorded.</p>}</details>
 </article>
}
