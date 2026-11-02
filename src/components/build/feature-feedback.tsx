'use client';
import {useEffect,useRef,useState,useTransition,type FormEvent} from 'react';
import {featureFeedbackAction} from '@/server/actions/feature-feedback';
import {DevelopmentScopePanel} from './development-scope';
import {OperatorCredentialField} from './operator-confirmation';
import type {ConversationView,ConversationList,FeedbackActionResult} from '@/modules/feature-feedback/presentation';
const states:Record<string,string>={AWAITING_ANALYSIS:'Waiting for AI analysis',CLARIFICATION:'Your answer is needed',PROPOSAL:'Proposal ready for review',CONFIRMED:'Proposal confirmed',REJECTED:'Proposal rejected',CANCELLED:'Conversation cancelled',CONFIRMED_STALE:'Confirmed proposal refers to an older feature version',CONFIRMATION_UNAVAILABLE:'Confirmation authority cannot currently be established'};
const decisions:Record<string,string>={RESPONSE:'Your answer',REVISION_REQUESTED:'Your requested revision',CONFIRMED:'You confirmed the proposal',REJECTED:'You rejected the proposal',CANCELLED:'You cancelled the conversation'};
const classification:Record<string,string>={DEFECT:'Issue to fix',IMPROVEMENT:'Improvement',REQUIREMENT_CHANGE:'Requirement change',NEW_FEATURE:'New feature'};
export function FeedbackConversationContent({conversation}:{conversation:ConversationView}){
 return <div className="space-y-4"><p role="status" className="font-medium">{states[conversation.status]??conversation.status}</p>
 <ol aria-label="Conversation history" className="space-y-4"><li className="rounded border p-3"><h4 className="font-medium">Your feedback</h4><p className="whitespace-pre-wrap break-words">{conversation.originalText}</p></li>
 {conversation.events.map(event=><li key={event.id} className="space-y-2 rounded border p-3">
  {event.analysis?<><h4 className="font-medium">AI’s understanding · {classification[event.analysis.classification]}</h4><p>{event.analysis.interpretation}</p><p>Requested outcome: {event.analysis.intendedOutcome}</p>
   {event.analysis.scope==='SEPARATE_BACKLOG_FEATURE'&&<div className="rounded border p-2"><strong>Suggested separate feature</strong><p>{event.analysis.scopeReason}</p><p>No backlog feature has been created.</p></div>}
   {!!event.analysis.questions.length&&<div><h5 className="font-medium">A little clarification</h5><ul className="list-disc pl-5">{event.analysis.questions.map(q=><li key={q.id}>{q.text}</li>)}</ul></div>}
   {event.analysis.proposal&&<div className="space-y-2"><h5 className="font-medium">Proposed changes · version {event.revision}</h5><p>{event.analysis.proposal.summary}</p><ul className="list-disc pl-5">{event.analysis.proposal.changes.map((change,i)=><li key={i}>{change}</li>)}</ul><h5 className="font-medium">What will remain unchanged</h5><ul className="list-disc pl-5">{event.analysis.proposal.unchanged.map((item,i)=><li key={i}>{item}</li>)}</ul><h5 className="font-medium">How the change should work</h5><ul className="list-disc pl-5">{event.analysis.proposal.acceptanceCriteria.map((item,i)=><li key={i}>{item}</li>)}</ul>{!!event.affectedRequirements.length&&<><h5 className="font-medium">Affected requirements</h5><ul className="list-disc pl-5">{event.affectedRequirements.map(r=><li key={r.id}>{r.text}</li>)}</ul></>}</div>}
  </>:<><h4 className="font-medium">{decisions[event.type]??'Saved conversation event'}{event.reviewedRevision!==null?` · version ${event.reviewedRevision}`:''}</h4>{event.text&&<p className="whitespace-pre-wrap break-words">{event.text}</p>}</>}
  <details className="text-xs text-muted-foreground"><summary>Version and history details</summary><p>{event.actor} · <time dateTime={event.at}>{event.at}</time></p><p className="break-all">Implementation: {event.version}</p></details>
 </li>)}</ol>
 {conversation.contextStatus==='STALE'&&<p role="alert">The feature or its requirements changed. Request a revised proposal before confirming.</p>}
 {conversation.contextStatus==='UNAVAILABLE'&&<p role="alert">The feature version cannot currently be established. Confirmation is disabled; reload before deciding.</p>}
 <p className="text-sm">Proposal confirmation records intent only. It does not change approved requirements, start development, or verify or accept this feature.</p>
 </div>;
}
function Credential(){return <OperatorCredentialField note="Cleared on submission; never saved with the conversation."/>}
export function FeedbackTextForm({operation,pending,onSubmit}:{operation:'START'|'RESPOND'|'REVISE'|'REJECT';pending:boolean;onSubmit:(event:FormEvent<HTMLFormElement>)=>void}){
 const label=operation==='START'?'Your feedback':operation==='REVISE'?'How should the proposal change?':operation==='REJECT'?'Reason (optional)':'Your answer';
 const button=operation==='START'?'Send feedback':operation==='REVISE'?'Send revision':operation==='REJECT'?'Reject proposal':'Send answer';
 return <form onSubmit={onSubmit} className="space-y-3"><input type="hidden" name="operation" value={operation}/><label className="block">{label}<textarea name="text" required={operation!=='REJECT'} maxLength={20000} rows={operation==='START'?4:3} className="block w-full rounded border p-2"/></label>{operation==='REJECT'&&<Credential/>}<button type="submit" disabled={pending} className="rounded border px-3 py-2">{button}</button></form>;
}
export function FeatureFeedbackPanel({productId,featureId,title,onClose,readOnly=false}:{productId:string;featureId:string;title:string;onClose:()=>void;readOnly?:boolean}){
 const [conversation,setConversation]=useState<ConversationView|null>(null),[list,setList]=useState<ConversationList>({items:[],nextCursor:null}),[loading,setLoading]=useState(true),[historyLoaded,setHistoryLoaded]=useState(false),[result,setResult]=useState<FeedbackActionResult>({status:'success'}),[pending,start]=useTransition(),[mode,setMode]=useState<{digest:string;action:'REVISE'|'REJECT'}|null>(null);
 const nonce=useRef({payload:'',id:''});
 function data(operation:string){const value=new FormData();value.set('productId',productId);value.set('featureId',featureId);value.set('operation',operation);return value}
 useEffect(()=>{let active=true;const value=new FormData();value.set('productId',productId);value.set('featureId',featureId);value.set('operation','LIST');featureFeedbackAction(value).then(next=>{if(active){if(next.conversations){setList(next.conversations);setHistoryLoaded(true)}setResult(next);setLoading(false)}}).catch(()=>{if(active){setResult({status:'error',message:'Conversation history could not load. You can retry.'});setLoading(false)}});return()=>{active=false}},[productId,featureId]);
 function apply(next:FeedbackActionResult){setResult(next);if(next.conversation)setConversation(next.conversation);if(next.conversations){setList(next.conversations);setHistoryLoaded(true)}}
 function inspect(id:string){const value=data('LOAD');value.set('feedbackId',id);start(async()=>{try{apply(await featureFeedbackAction(value))}catch{setResult({status:'error',message:'The conversation could not load. Retry without resubmitting feedback.'})}})}
 function loadMore(cursor?:string){const value=data('LIST');if(cursor)value.set('cursor',cursor);start(async()=>{try{const next=await featureFeedbackAction(value);setResult(next);if(next.conversations){setHistoryLoaded(true);setList(old=>({items:cursor?[...old.items,...next.conversations!.items]:next.conversations!.items,nextCursor:next.conversations!.nextCursor}))}}catch{setResult({status:'error',message:'History is unavailable. Retry loading it.'})}})}
 function submit(event:FormEvent<HTMLFormElement>){event.preventDefault();const origin=window.location;if(origin.protocol!=='https:'&&!['localhost','127.0.0.1','[::1]'].includes(origin.hostname)){setResult({status:'error',message:'Use localhost or HTTPS for operator confirmation.'});return}
  const element=event.currentTarget,value=new FormData(element),submitter=(event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement|null;value.set('operation',submitter?.value||String(value.get('operation')));value.set('productId',productId);value.set('featureId',featureId);
  if(conversation){value.set('feedbackId',conversation.id);value.set('revision',String(conversation.revision));value.set('digest',conversation.digest)}
  const payload=JSON.stringify([...value.entries()].filter(([key])=>key!=='credential'));if(nonce.current.payload!==payload)nonce.current={payload,id:crypto.randomUUID()};value.set('idempotencyKey',nonce.current.id);
  const input=element.elements.namedItem('credential') as HTMLInputElement|null;if(input)input.value='';
  start(async()=>{try{const next=await featureFeedbackAction(value);apply(next);if(next.status==='success')nonce.current={payload:'',id:''}}catch{setResult({status:'error',message:'Connection lost. Reload saved conversations before retrying.'})}finally{value.delete('credential')}});
 }
 const action=mode?.digest===conversation?.digest?mode?.action:null,proposal=conversation?.status==='PROPOSAL',clarify=conversation?.status==='CLARIFICATION',waiting=conversation?.status==='AWAITING_ANALYSIS';
 return <section aria-label={`Feedback for ${title}`} className="space-y-4 rounded-xl border p-4">
  <div className="flex justify-between gap-4"><h3 className="font-semibold">Request changes: {title}</h3><button type="button" onClick={onClose} className="rounded border px-3 py-1">Close feedback</button></div>
  <p>Tell us what you want to change. You can give feedback before technical verification; acceptance remains a separate decision.</p>
  <div className="grid gap-4 md:grid-cols-[minmax(10rem,1fr)_3fr]">
   <nav aria-label="Previous feedback conversations" className="space-y-2"><h4 className="font-medium">Previous conversations</h4>{loading&&<p role="status">Loading history…</p>}{!loading&&historyLoaded&&!list.items.length&&<p>No conversations yet.</p>}<ul>{list.items.map(item=><li key={item.id}><button type="button" disabled={pending} aria-current={conversation?.id===item.id?'true':undefined} className="my-1 w-full rounded border p-2 text-left break-words" onClick={()=>inspect(item.id)}>{item.text}<span className="block text-xs">{new Date(item.at).toLocaleDateString('en-GB')}</span></button></li>)}</ul>{list.nextCursor&&<button type="button" disabled={pending} onClick={()=>loadMore(list.nextCursor!)}>More conversations</button>}<button type="button" disabled={pending} onClick={()=>loadMore()}>Reload history</button>{!readOnly&&<button type="button" disabled={pending} className="block rounded border p-2" onClick={()=>{setConversation(null);setResult({status:'success'});setMode(null)}}>New conversation</button>}</nav>
   <div className="space-y-4 min-w-0">{conversation?<FeedbackConversationContent conversation={conversation}/>:<p>Describe the outcome you want, what is happening now, or what should work differently.</p>}
    {pending&&<p role="status" aria-live="polite">Working with your feedback…</p>}
    {result.message&&<p role={result.status==='error'?'alert':'status'}>{result.message}</p>}
    {conversation?.confirmed&&<DevelopmentScopePanel key={conversation.id} productId={productId} featureId={featureId} feedbackId={conversation.id} readOnly={readOnly}/>}
    {readOnly?<p>This feature is archived. Conversation history is read-only.</p>:<>
    {!conversation&&<FeedbackTextForm operation="START" pending={pending} onSubmit={submit}/>}
    {conversation&&(clarify||action==='REVISE'||action==='REJECT')&&<div><FeedbackTextForm key={`${conversation.digest}:${action??'RESPOND'}`} operation={action??'RESPOND'} pending={pending} onSubmit={submit}/>{action&&<button type="button" onClick={()=>setMode(null)}>Back to proposal</button>}</div>}
    {conversation&&proposal&&!action&&<div className="space-y-3"><form key={conversation.digest} onSubmit={submit} className="space-y-3"><input type="hidden" name="operation" value="CONFIRM"/><label className="block"><input type="checkbox" name="acknowledged" value="yes" required/> I have reviewed this exact proposal (version {conversation.revision}).</label><Credential/><button type="submit" disabled={pending||conversation.contextStatus!=='CURRENT'} className="rounded border px-3 py-2 disabled:opacity-50">Confirm proposal</button></form><div className="flex gap-3"><button type="button" disabled={pending} onClick={()=>setMode({digest:conversation.digest,action:'REVISE'})}>Revise proposal</button><button type="button" disabled={pending} onClick={()=>setMode({digest:conversation.digest,action:'REJECT'})}>Reject proposal</button></div></div>}
    {conversation&&waiting&&<form onSubmit={submit} className="space-y-3"><input type="hidden" name="operation" value="ANALYSE"/><button type="submit" disabled={pending} className="rounded border p-2">Retry AI analysis</button></form>}
    {conversation&&waiting&&<details><summary>Cancel conversation</summary><form onSubmit={submit} className="space-y-3"><input type="hidden" name="operation" value="CANCEL"/><Credential/><button type="submit" disabled={pending}>Confirm cancellation</button></form></details>}
    {conversation&&<button type="button" disabled={pending} onClick={()=>inspect(conversation.id)}>Reload this conversation</button>}
    </>}
   </div>
  </div>
 </section>;
}
