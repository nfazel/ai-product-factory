'use client';
import {useEffect,useState,useTransition} from 'react';
import {previewAction,type PreviewActionResult} from '@/server/actions/preview';
import type {PreviewView} from '@/modules/preview/helpers';
import {routeLabel} from '@/modules/preview/helpers';

const sizes={phone:{label:'Phone',width:390},tablet:{label:'Tablet',width:768},desktop:{label:'Desktop',width:null}} as const;
type Size=keyof typeof sizes;

/** Presentational: the running app inside a sandboxed frame, at a chosen screen size. */
export function PreviewFrame({preview,size,path='/',onGo}:{preview:PreviewView;size:Size;path?:string;onGo?:(path:string)=>void}){
 const width=sizes[size].width,address=`${preview.url??''}${path==='/'?'':path}`;
 return <div className="space-y-2">
  <p className="text-sm">Running the latest committed version{preview.commit?<> (<code>{preview.commit.slice(0,7)}</code>{preview.commitSubject?`: ${preview.commitSubject}`:''})</>:null}. <a href={address||'#'} target="_blank" rel="noopener noreferrer" className="underline">Open in a new tab</a></p>
  {preview.pages.length>1&&<nav aria-label="Pages in this app" className="flex flex-wrap items-center gap-2 text-sm"><span>Go to:</span>{preview.pages.map(page=><button key={page} type="button" aria-current={page===path?'page':undefined} onClick={()=>onGo?.(page)} className="rounded border px-2 py-1 aria-[current=page]:font-semibold">{routeLabel(page)}</button>)}</nav>}
  <iframe key={address} title="Live preview of the product" src={address||undefined} sandbox="allow-scripts allow-forms allow-same-origin allow-popups allow-modals" className="mx-auto block rounded border bg-white" style={{width:width?`${width}px`:'100%',maxWidth:'100%',height:'720px'}}/>
 </div>;
}

export function LivePreviewPanel({productId}:{productId:string}){
 const [preview,setPreview]=useState<PreviewView|null>(null),[loaded,setLoaded]=useState(false),[result,setResult]=useState<PreviewActionResult>({status:'success'}),[size,setSize]=useState<Size>('phone'),[path,setPath]=useState('/'),[pending,start]=useTransition();
 const call=(operation:string)=>{const value=new FormData();value.set('productId',productId);value.set('operation',operation);return previewAction(value)};
 useEffect(()=>{let active=true;call('STATUS').then(next=>{if(!active)return;if(next.preview)setPreview(next.preview);else setResult(next);setLoaded(true)}).catch(()=>{if(active){setResult({status:'error',message:'Preview status could not load. Reload to retry.'});setLoaded(true)}});return()=>{active=false}},
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [productId]);
 function act(operation:'START'|'STOP'){start(async()=>{try{const next=await call(operation);setResult(next);if(next.preview)setPreview(next.preview)}catch{setResult({status:'error',message:'Connection lost. Reload before retrying.'})}})}
 const running=preview?.state==='RUNNING';
 return <section aria-label="Live preview" className="space-y-3 rounded-xl border p-4">
  <h2 className="text-lg font-semibold">Live preview</h2>
  <p>Use the real app as it stands now. It runs as a private, throwaway copy on this computer, so anything you create in it is discarded when you stop it.</p>
  {!loaded&&<p role="status">Checking the preview…</p>}
  {pending&&<p role="status" aria-live="polite">Working… starting the preview can take up to a minute.</p>}
  {result.message&&<p role={result.status==='error'?'alert':'status'}>{result.message}</p>}
  {loaded&&!running&&<button type="button" disabled={pending} onClick={()=>act('START')} className="rounded border px-3 py-2">Start preview</button>}
  {loaded&&running&&preview&&<>
   <div className="flex flex-wrap items-center gap-3" role="group" aria-label="Screen size">{(Object.keys(sizes) as Size[]).map(key=><button key={key} type="button" aria-pressed={size===key} onClick={()=>setSize(key)} className="rounded border px-3 py-1 aria-pressed:font-semibold">{sizes[key].label}</button>)}<button type="button" disabled={pending} onClick={()=>act('STOP')} className="ml-auto rounded border px-3 py-1">Stop preview</button></div>
   <PreviewFrame preview={preview} size={size} path={path} onGo={setPath}/>
  </>}
 </section>;
}
