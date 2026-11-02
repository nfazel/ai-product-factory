import {createHash} from 'node:crypto';
/** Pure helpers for the live preview; no processes, files or database here. */
export const PREVIEW_PORT_RANGE={first:4400,last:4499};
export type PreviewRecord={productId:string;pid:number;port:number;commit:string;branch:string;databaseName:string;startedAt:string};
export type PreviewState='STOPPED'|'RUNNING';
export type PreviewView={state:PreviewState;url:string|null;port:number|null;commit:string|null;commitSubject:string|null;branch:string|null;startedAt:string|null;pages:string[]};

/** Stable per-product id so a restart replaces, rather than leaks, the previous scratch database. */
export function previewDatabaseId(productId:string){return createHash('sha256').update(`apf-preview:${productId}`).digest('hex').slice(0,32)}
/** Product ids become folder names, so only the characters the app itself generates are accepted. */
export function safeProductId(productId:string){if(!/^[A-Za-z0-9_-]{8,64}$/.test(productId))throw new Error('Invalid product id.');return productId}
/** The preview app sees only what it needs: no builder credentials, AI keys or operator key. */
export function previewEnv(base:Record<string,string|undefined>,input:{databaseUrl:string;sessionSecret:string;port:number}){
 const env={DATABASE_URL:input.databaseUrl,SESSION_SECRET:input.sessionSecret,PORT:String(input.port),NEXT_TELEMETRY_DISABLED:'1',NODE_ENV:'development'};
 for(const key of ['PATH','HOME','TMPDIR','LANG'])if(base[key])(env as Record<string,string>)[key]=base[key]!;
 return env as unknown as NodeJS.ProcessEnv;
}
/** First free port in the preview range; `isFree` is injected so this can be tested without sockets. */
export async function pickPort(isFree:(port:number)=>Promise<boolean>,taken:number[]=[]){
 for(let port=PREVIEW_PORT_RANGE.first;port<=PREVIEW_PORT_RANGE.last;port++)if(!taken.includes(port)&&await isFree(port))return port;
 throw new Error('No free preview port is available.');
}
/** A saved record only counts as running while its process is ours and still alive. */
export function viewOf(record:PreviewRecord|null,alive:boolean,subject:string|null=null,pages:string[]=[]):PreviewView{
 if(!record||!alive)return{state:'STOPPED',url:null,port:null,commit:null,commitSubject:null,branch:null,startedAt:null,pages:[]};
 return{state:'RUNNING',url:`http://127.0.0.1:${record.port}`,port:record.port,commit:record.commit,commitSubject:subject,branch:record.branch,startedAt:record.startedAt,pages};
}
/** The pid must still look like the Next.js server we started on that port, so a recycled pid is never signalled. */
export function looksLikePreviewProcess(command:string,port:number){return /\bnext\b/.test(command)&&command.includes(`-p ${port}`)}
export function tail(text:string,lines=12){return text.split('\n').filter(Boolean).slice(-lines).join('\n').slice(-1500)}

/** Pages worth linking to, from Next.js page files (relative paths): static routes only, no API or dynamic segments. */
export function routesFromPageFiles(files:string[],limit=12){
 const routes=new Set<string>();
 for(const file of files){
  const parts=file.replace(/\\/g,'/').replace(/^src\//,'').split('/');
  if(parts[0]!=='app'||!/^page\.(tsx|jsx|ts|js)$/.test(parts[parts.length-1]))continue;
  const segments=parts.slice(1,-1).filter(part=>!/^\(.*\)$/.test(part));
  if(segments.some(part=>part.includes('[')||part.startsWith('@')||part.startsWith('_'))||segments[0]==='api')continue;
  routes.add('/'+segments.join('/'));
 }
 return [...routes].sort((a,b)=>a==='/'?-1:b==='/'?1:a.localeCompare(b)).slice(0,limit);
}
export function routeLabel(route:string){if(route==='/')return 'Home';const words=route.slice(1).split('/').join(' ').replace(/[-_]+/g,' ');return words.charAt(0).toUpperCase()+words.slice(1)}
