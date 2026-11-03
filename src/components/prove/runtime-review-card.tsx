'use client';
import {useEffect,useState,useTransition} from 'react';
import {runtimeReviewAction,type RuntimeReviewActionResult} from '@/server/actions/runtime-review';
import {OperatorCredentialField} from '@/components/build/operator-confirmation';
import type {RuntimeReviewView} from '@/modules/verification/runtime-review-view';

const titles:Record<string,string>={APPROVED:'Runtime review approved',NEEDED:'Runtime review needed before this task can be verified again',UNAVAILABLE:'Runtime review not available yet',NOT_APPLICABLE:'Runtime review'};
const when=(iso:string)=>iso?new Date(iso).toISOString().replace('T',' ').slice(0,16)+' UTC':'';

/** Presentational: exactly what will run, and where this step sits in re-verifying a task. */
export function RuntimeReviewContent({review,onRestore,busy=false}:{review:RuntimeReviewView;onRestore?:()=>void;busy?:boolean}){
 const r=review.review;
 return <div className="space-y-3">
  <p role="status" className="font-medium">{titles[review.state]}</p>
  <p>{review.message}</p>
  {review.state==='APPROVED'&&review.approved&&<p className="text-sm">Approved by {review.approved.by}{review.approved.at?` · ${when(review.approved.at)}`:''}.</p>}
  {review.restorable&&onRestore&&<div className="space-y-2 rounded border p-3"><p className="text-sm">This rebuilds the folder exactly at the commit a person approved, and refuses if it cannot. It changes no code and calls no AI.</p><button type="button" disabled={busy} onClick={onRestore} className="btn btn-secondary">Restore working copy</button></div>}
  <p className="text-sm">This does not judge the task. It only allows the checks below to run, in isolated containers, on this exact version of the code.</p>
  {r&&<div className="space-y-2 rounded border p-3">
   <h4 className="font-medium">What will be run</h4>
   <p className="text-sm">Version <code>{r.commit.slice(0,7)}</code> · {r.files} files · code approved by {r.codeApprovedBy}{r.codeApprovedAt?` on ${when(r.codeApprovedAt)}`:''}.</p>
   {r.developmentMode&&<p className="rounded border p-2 text-sm"><strong>Development mode.</strong> This review is bound to the code version, the plan, the code approval and your signature, but not to the version of the framework&apos;s own code. Do not rely on it for a release.</p>}
   {r.planSummary&&<p className="text-sm"><strong>Approved plan (v{r.planVersion}):</strong> {r.planSummary}</p>}
   {r.proves.length>0&&<div className="text-sm"><strong>Signed by a person:</strong> these tests prove these requirements, counted only while they pass.<ul className="list-disc pl-5">{r.proves.map((p,i)=><li key={i}><code>{p.command}</code> proves: {p.criterion}</li>)}</ul></div>}
   {r.checks.length>0?<ul className="list-disc pl-5 text-sm">{r.checks.map(c=><li key={c.command}><code>{c.command}</code> — {c.howItRuns}</li>)}</ul>:<p className="text-sm">No runtime checks are declared in the approved plan.</p>}
   {r.criteria.length>0&&<details><summary className="text-sm">Requirements being verified ({r.criteria.length})</summary><ul className="list-disc pl-5 text-sm">{r.criteria.map((c,i)=><li key={i}>{c}</li>)}</ul></details>}
  </div>}
  <div className="space-y-1 text-sm">
   <h4 className="font-medium">What is still needed to re-run</h4>
   <ul className="list-disc pl-5">
    <li>{review.state==='APPROVED'?'✓':'•'} A person&apos;s runtime review{review.state==='APPROVED'?' (done)':''}.</li>
    <li>{review.containerVerification?'✓':'•'} Container verification switched on{review.containerVerification?' (on)':' (currently off; turning it on is a decision for the local operator)'}.</li>
   </ul>
   {review.state==='APPROVED'&&review.containerVerification&&<p>Next: open the <a href="?tab=approval#verification-tabs" className="underline">Approval tab</a> and use <strong>Re-run failed tests</strong>.</p>}
  </div>
 </div>;
}

export function RuntimeReviewCard({productId,taskId}:{productId:string;taskId:string}){
 const [review,setReview]=useState<RuntimeReviewView|null>(null),[loaded,setLoaded]=useState(false),[result,setResult]=useState<RuntimeReviewActionResult>({status:'success'}),[pending,start]=useTransition();
 useEffect(()=>{let active=true;const value=new FormData();value.set('productId',productId);value.set('taskId',taskId);value.set('operation','LOAD');
  runtimeReviewAction(value).then(next=>{if(!active)return;if(next.review)setReview(next.review);else setResult(next);setLoaded(true)}).catch(()=>{if(active){setResult({status:'error',message:'The runtime review could not load. Reload to retry.'});setLoaded(true)}});return()=>{active=false}},[productId,taskId]);
 function approve(event:React.FormEvent<HTMLFormElement>){event.preventDefault();
  const element=event.currentTarget,value=new FormData(element);value.set('productId',productId);value.set('taskId',taskId);value.set('operation','APPROVE');value.set('digest',review?.digest??'');
  const input=element.elements.namedItem('credential') as HTMLInputElement|null;if(input)input.value='';
  start(async()=>{try{const next=await runtimeReviewAction(value);setResult(next);if(next.review)setReview(next.review)}catch{setResult({status:'error',message:'Connection lost. Reload before retrying.'})}finally{value.delete('credential')}});
 }
 function restore(){
  const value=new FormData();value.set('productId',productId);value.set('taskId',taskId);value.set('operation','RESTORE');
  start(async()=>{try{const next=await runtimeReviewAction(value);setResult(next);if(next.review)setReview(next.review)}catch{setResult({status:'error',message:'Connection lost. Reload before retrying.'})}});
 }
 if(loaded&&review?.state==='NOT_APPLICABLE')return null;
 return <section aria-label="Runtime review" className="space-y-3 rounded-xl border p-4">
  {!loaded&&<p role="status">Loading the runtime review…</p>}
  {pending&&<p role="status" aria-live="polite">Working…</p>}
  {result.message&&<p role={result.status==='error'?'alert':'status'}>{result.message}</p>}
  {loaded&&review&&<RuntimeReviewContent review={review} onRestore={restore} busy={pending}/>}
  {loaded&&review?.state==='NEEDED'&&<form key={review.digest??'review'} onSubmit={approve} className="space-y-3 border-t pt-3">
   {review.candidates.length>0&&<fieldset className="space-y-1 text-sm"><legend className="font-medium">Run these existing tests against the app and a throwaway database</legend>
    <p>Tests that call the running app and check the database cannot work without them. Tick the tests that need this. Your choice is recorded in your signed approval and cannot be changed afterwards.</p>
    {review.candidates.map(command=><div key={command} className="space-y-1"><label className="block"><input type="checkbox" name="runAgainstApp" value={command}/> <code>{command}</code></label>
      {review.criteriaChoices.length>0&&<div className="ml-6"><p>If you tick it, you may also state which requirement it proves. This is your signed statement; it counts only while the test passes on this exact version.</p>{review.criteriaChoices.map(choice=><label key={choice.id} className="block"><input type="checkbox" name="proves" value={`${command}|${choice.id}`}/> Proves: {choice.description}</label>)}</div>}</div>)}</fieldset>}
   <label className="block text-sm"><input type="checkbox" name="reviewed" value="yes" required/> I have read what will be run.</label>
   <label className="block text-sm">Why are you comfortable approving this?<textarea name="reason" required minLength={12} maxLength={2000} rows={2} className="mt-1 block w-full rounded border p-2" placeholder="For example: the checks match the approved plan and run only against a throwaway database."/></label>
   <OperatorCredentialField/>
   <button type="submit" disabled={pending} className="btn btn-primary">Approve runtime review</button>
  </form>}
 </section>;
}
