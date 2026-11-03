'use client';
import {useEffect,useState,useTransition} from 'react';
import {designAction,type DesignActionResult} from '@/server/actions/design';
import type {DesignView} from '@/modules/design/presentation';

type Current=NonNullable<DesignView['current']>;
const status:Record<string,string>={NONE:'No design yet',DRAFT:'Draft — waiting for your review',APPROVED:'Approved'};

/** One screen, drawn in a frame that cannot run scripts or reach the internet. */
export function ScreenFrame({doc,name}:{doc:string;name:string}){
 return <iframe title={`Screen: ${name}`} srcDoc={doc} sandbox="" referrerPolicy="no-referrer" className="mx-auto block rounded-2xl border bg-white shadow-sm" style={{width:'390px',maxWidth:'100%',height:'720px'}}/>;
}

/** Presentational: the design as a person reviews it. */
export function DesignReview({design,screenId,onScreen}:{design:Current;screenId:string;onScreen:(id:string)=>void}){
 const screen=design.screens.find(s=>s.id===screenId)??design.screens[0],nameOf=(id:string)=>design.screens.find(s=>s.id===id)?.name??id;
 return <div className="space-y-4">
  <p>{design.summary}</p>
  <p className="rounded border p-3 text-sm"><strong>What changed in this version:</strong> {design.changeNote}</p>
  <nav aria-label="Screens" className="flex flex-wrap gap-2">{design.screens.map(item=><button key={item.id} type="button" aria-current={item.id===screen.id?'true':undefined} onClick={()=>onScreen(item.id)} className="btn btn-secondary btn-sm">{item.name}</button>)}</nav>
  <div className="grid gap-6 lg:grid-cols-[26rem_minmax(0,1fr)]">
   <ScreenFrame doc={screen.doc} name={screen.name}/>
   <div className="space-y-3">
    <h3 className="text-base font-semibold">{screen.name}</h3>
    <p>{screen.purpose}</p>
    {!!screen.features.length&&<p className="text-sm"><strong>Serves:</strong> {screen.features.join(', ')}</p>}
    <div><h4 className="font-medium">On this screen</h4><ul className="list-disc pl-5">{screen.elements.map((e,i)=><li key={i}>{e}</li>)}</ul></div>
    {!!screen.actions.length&&<div><h4 className="font-medium">What a person can do</h4><ul className="list-disc pl-5">{screen.actions.map((a,i)=><li key={i}>{a}</li>)}</ul></div>}
    {design.flow.filter(step=>step.from===screen.id).length>0&&<div><h4 className="font-medium">Where they go next</h4><ul className="list-disc pl-5">{design.flow.filter(step=>step.from===screen.id).map((step,i)=><li key={i}>{step.label} → <button type="button" className="btn btn-link" onClick={()=>onScreen(step.to)}>{nameOf(step.to)}</button></li>)}</ul></div>}
   </div>
  </div>
  <div><h4 className="font-medium">Design rules followed</h4><ul className="list-disc pl-5">{design.principles.map((p,i)=><li key={i}>{p}</li>)}</ul></div>
  {!!design.openQuestions.length&&<div className="rounded border p-3"><h4 className="font-medium">Questions for you</h4><ul className="list-disc pl-5">{design.openQuestions.map((q,i)=><li key={i}>{q}</li>)}</ul></div>}
 </div>;
}

export function DesignWorkspace({productId}:{productId:string}){
 const [design,setDesign]=useState<DesignView|null>(null),[loaded,setLoaded]=useState(false),[result,setResult]=useState<DesignActionResult>({status:'success'}),[screenId,setScreenId]=useState(''),[pending,start]=useTransition();
 const call=(operation:string,extra:Record<string,string>={})=>{const value=new FormData();value.set('productId',productId);value.set('operation',operation);for(const [k,v] of Object.entries(extra))value.set(k,v);return designAction(value)};
 useEffect(()=>{let active=true;call('LOAD').then(next=>{if(!active)return;if(next.design)setDesign(next.design);else setResult(next);setLoaded(true)}).catch(()=>{if(active){setResult({status:'error',message:'The design could not load. Reload to retry.'});setLoaded(true)}});return()=>{active=false}},
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [productId]);
 function run(operation:string,extra:Record<string,string>={}){start(async()=>{try{const next=await call(operation,extra);setResult(next);if(next.design)setDesign(next.design)}catch{setResult({status:'error',message:'Connection lost. Reload before retrying.'})}})}
 const current=design?.current??null;
 return <section aria-label="UI/UX design" className="space-y-4 rounded-xl border p-4">
  {!loaded&&<p role="status">Loading the design…</p>}
  {pending&&<p role="status" aria-live="polite">Working… drawing the screens can take a minute or two.</p>}
  {result.message&&<p role={result.status==='error'?'alert':'status'}>{result.message}</p>}
  {loaded&&design&&<p className="text-sm">Designing for: <strong>{design.platforms}</strong>. {design.platforms==='not chosen yet'?'Until you choose, a website that works well on phones is assumed. You can choose in the Explore tab.':''}</p>}
  {loaded&&design&&<p role="status" className="font-medium">{status[design.status]}{current?` · version ${current.version}`:''}</p>}
  {loaded&&design&&!current&&<div className="space-y-3"><p>No screens have been proposed yet. The AI will use your brief, your features and their requirements.</p><button type="button" disabled={pending} onClick={()=>run('GENERATE')} className="btn btn-primary">Draw the screens</button></div>}
  {current&&<DesignReview design={current} screenId={screenId} onScreen={setScreenId}/>}
  {current&&design&&design.status!=='APPROVED'&&<div className="space-y-4 border-t pt-4">
   <form key={`${current.runId}:revise`} onSubmit={event=>{event.preventDefault();const form=event.currentTarget,instructions=String(new FormData(form).get('instructions')??'');run('REVISE',{runId:current.runId,instructions});form.reset()}} className="space-y-3">
    <label className="block">What should change?<textarea name="instructions" required maxLength={4000} rows={3} className="mt-1 block w-full rounded border p-2" placeholder="For example: make the sign-up screen simpler and use larger buttons."/></label>
    <button type="submit" disabled={pending} className="btn btn-secondary">Ask for changes</button>
   </form>
   <form key={`${current.runId}:approve`} onSubmit={event=>{event.preventDefault();run('APPROVE',{runId:current.runId,digest:current.digest,reviewed:'yes'})}} className="space-y-3">
    <label className="block text-sm"><input type="checkbox" required/> I have looked at every screen in this version.</label>
    <button type="submit" disabled={pending} className="btn btn-primary">Approve this design</button>
    <p className="text-sm">Approving records that you are happy with these screens. It guides the scope and tasks you create next. It does not start any coding.</p>
   </form>
  </div>}
  {current&&design?.status==='APPROVED'&&<p className="rounded border p-3 text-sm">This version is approved. To change it, ask for changes below; the new version will need approving again.</p>}
  {current&&design?.status==='APPROVED'&&<form key={`${current.runId}:revise-approved`} onSubmit={event=>{event.preventDefault();const form=event.currentTarget;run('REVISE',{runId:current.runId,instructions:String(new FormData(form).get('instructions')??'')});form.reset()}} className="space-y-3"><label className="block">What should change?<textarea name="instructions" required maxLength={4000} rows={3} className="mt-1 block w-full rounded border p-2"/></label><button type="submit" disabled={pending} className="btn btn-secondary">Ask for changes</button></form>}
  {design&&design.history.length>1&&<details><summary>Earlier versions ({design.history.length-1})</summary><ol className="mt-2 space-y-2">{design.history.map(item=><li key={item.runId} className="rounded border p-2 text-sm"><strong>Version {item.version}</strong>{item.approved?' · approved':''} — {item.changeNote}{item.instructions?<><br/><span className="text-muted-foreground">You asked: {item.instructions}</span></>:null}</li>)}</ol></details>}
 </section>;
}
