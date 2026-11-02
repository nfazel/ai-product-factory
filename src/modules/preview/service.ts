import 'server-only';
import {spawn,execFile} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import {resolveProductRepository} from '@/modules/source-control/product-repository';
import {provisionVerificationDatabase,dropOrphanedVerificationDatabase,verificationDatabaseAdminUrl} from '@/modules/verification/http/database';
import {builderDatabaseNames} from '@/modules/verification/recovery';
import {DomainError} from '@/modules/shared/errors';
import {looksLikePreviewProcess,pickPort,previewDatabaseId,previewEnv,routesFromPageFiles,safeProductId,tail,viewOf,type PreviewRecord,type PreviewView} from './helpers';

/**
 * Live preview: run the product's latest committed code so a person can use it.
 * It runs a throwaway copy on 127.0.0.1 only, with its own scratch database and a minimal environment, and never
 * touches the product repository's working tree or the builder's data. Currently supports Next.js products.
 */
const STEP_MS={export:60_000,clone:120_000,install:300_000,prisma:120_000,ready:90_000};
const locks=new Map<string,Promise<unknown>>();
async function exclusive<T>(productId:string,work:()=>Promise<T>):Promise<T>{
 const previous=locks.get(productId)??Promise.resolve(),next=previous.catch(()=>undefined).then(work);locks.set(productId,next);
 try{return await next}finally{if(locks.get(productId)===next)locks.delete(productId)}
}
const baseDir=(productId:string)=>path.join(os.homedir(),'.ai-product-factory','previews',safeProductId(productId));
const recordFile=(productId:string)=>path.join(baseDir(productId),'preview.json');
const sourceDir=(productId:string)=>path.join(baseDir(productId),'source');
const logFile=(productId:string)=>path.join(baseDir(productId),'preview.log');

function run(command:string,args:string[],options:{cwd?:string;env?:NodeJS.ProcessEnv;timeout:number}){
 return new Promise<{code:number;stdout:string;stderr:string}>(resolve=>{
  execFile(command,args,{cwd:options.cwd,env:options.env??process.env,timeout:options.timeout,maxBuffer:8*1024*1024},(error,stdout,stderr)=>{
   const code=error?(typeof (error as {code?:unknown}).code==='number'?(error as {code:number}).code:1):0;
   resolve({code,stdout:String(stdout),stderr:String(stderr)});
  });
 });
}
function readRecord(productId:string):PreviewRecord|null{try{const value=JSON.parse(fs.readFileSync(recordFile(productId),'utf8')) as PreviewRecord;return value.productId===productId&&Number.isInteger(value.pid)&&Number.isInteger(value.port)?value:null}catch{return null}}
async function alive(record:PreviewRecord){
 try{process.kill(record.pid,0)}catch{return false}
 const ps=await run('ps',['-p',String(record.pid),'-o','command='],{timeout:5000});
 return ps.code===0&&looksLikePreviewProcess(ps.stdout,record.port);
}
const portIsFree=(port:number)=>new Promise<boolean>(resolve=>{const server=net.createServer();server.once('error',()=>resolve(false));server.listen(port,'127.0.0.1',()=>server.close(()=>resolve(true)))});
async function subject(productId:string,commit:string){try{const repo=await resolveProductRepository(productId),log=await run('git',['-C',repo.localPath,'log','-1','--format=%s',commit],{timeout:10_000});return log.code===0?log.stdout.trim().slice(0,200):null}catch{return null}}

function pagesOf(productId:string){
 try{const root=sourceDir(productId),base=['src/app','app'].find(dir=>fs.existsSync(path.join(root,dir)));if(!base)return [];
  const files=(fs.readdirSync(path.join(root,base),{recursive:true}) as string[]).filter(file=>/(^|\/)page\.(tsx|jsx|ts|js)$/.test(String(file))).map(file=>`${base}/${file}`);
  return routesFromPageFiles(files);
 }catch{return []}
}
export async function getPreviewStatus(productId:string):Promise<PreviewView>{
 const record=readRecord(productId),isAlive=record?await alive(record):false;
 return viewOf(record,isAlive,record&&isAlive?await subject(productId,record.commit):null,isAlive?pagesOf(productId):[]);
}

async function exportCommit(repoPath:string,commit:string,dest:string){
 await fs.promises.rm(dest,{recursive:true,force:true});await fs.promises.mkdir(dest,{recursive:true});
 await new Promise<void>((resolve,reject)=>{
  const git=spawn('git',['-C',repoPath,'archive','--format=tar',commit]),tar=spawn('tar',['-x','-C',dest]);let error='';
  const timer=setTimeout(()=>{git.kill();tar.kill();reject(new DomainError('Exporting the code took too long.'))},STEP_MS.export);
  git.stderr.on('data',d=>{error+=String(d)});tar.stderr.on('data',d=>{error+=String(d)});git.stdout.pipe(tar.stdin);
  const codes:number[]=[];const done=(code:number|null)=>{codes.push(code??1);if(codes.length===2){clearTimeout(timer);if(codes.every(c=>c===0))resolve();else reject(new DomainError(`The code could not be exported. ${tail(error,3)}`))}};
  git.on('close',done);tar.on('close',done);git.on('error',()=>done(1));tar.on('error',()=>done(1));
 });
}
async function prepareModules(repoPath:string,dest:string){
 const target=path.join(dest,'node_modules'),existing=path.join(repoPath,'node_modules');
 if(fs.existsSync(existing)){
  // Copy-on-write clone where the filesystem supports it, so this is instant and the repository is never written to.
  const clone=await run('cp',['-cR',existing,target],{timeout:STEP_MS.clone});
  if(clone.code===0)return;await fs.promises.rm(target,{recursive:true,force:true});
  const copy=await run('cp',['-R',existing,target],{timeout:STEP_MS.clone});if(copy.code===0)return;await fs.promises.rm(target,{recursive:true,force:true});
 }
 const install=await run('npm',['ci','--no-audit','--no-fund'],{cwd:dest,timeout:STEP_MS.install});
 if(install.code!==0)throw new DomainError(`The product's dependencies could not be installed. ${tail(install.stderr||install.stdout,4)}`);
}
async function waitUntilReady(port:number,record:PreviewRecord,productId:string){
 const deadline=Date.now()+STEP_MS.ready;
 while(Date.now()<deadline){
  if(!await alive(record))throw new DomainError(`The preview stopped while starting. ${tail(readLog(productId),6)}`);
  try{const response=await fetch(`http://127.0.0.1:${port}/`,{signal:AbortSignal.timeout(4000),redirect:'manual'});if(response.status<500||Date.now()+8000>deadline)return}catch{/* not up yet */}
  await new Promise(resolve=>setTimeout(resolve,1000));
 }
 throw new DomainError(`The preview did not become ready in time. ${tail(readLog(productId),6)}`);
}
const readLog=(productId:string)=>{try{return fs.readFileSync(logFile(productId),'utf8')}catch{return ''}};

export function startPreview(productId:string):Promise<PreviewView>{
 return exclusive(productId,async()=>{
  const current=await getPreviewStatus(productId);if(current.state==='RUNNING')return current;
  await stopQuietly(productId);
  const repo=await resolveProductRepository(productId);
  const resolved=await run('git',['-C',repo.localPath,'rev-parse','--verify',`${repo.defaultBranch}^{commit}`],{timeout:10_000});
  const commit=resolved.code===0&&/^[a-f0-9]{40}$/.test(resolved.stdout.trim())?resolved.stdout.trim():repo.head;
  if(!/^[a-f0-9]{40}$/.test(commit))throw new DomainError('The product repository has no committed code to preview yet.');
  const dir=sourceDir(productId),hasDatabase=fs.existsSync(path.join(repo.localPath,'prisma','schema.prisma'));
  await fs.promises.mkdir(baseDir(productId),{recursive:true,mode:0o700});
  await exportCommit(repo.localPath,commit,dir);
  if(!fs.existsSync(path.join(dir,'package.json')))throw new DomainError('This repository has no package.json, so it cannot be previewed.');
  await prepareModules(repo.localPath,dir);
  const nextBin=path.join(dir,'node_modules','next','dist','bin','next');
  if(!fs.existsSync(nextBin))throw new DomainError('Preview currently supports Next.js products only.');

  const forbidden=builderDatabaseNames(),adminUrl=verificationDatabaseAdminUrl();
  let database:Awaited<ReturnType<typeof provisionVerificationDatabase>>|null=null;
  if(hasDatabase){
   if(!adminUrl)throw new DomainError('The preview needs a throwaway database, and VERIFICATION_DATABASE_ADMIN_URL is not configured. It is the same dedicated, limited database role that verification uses; ask the local operator to set it up.');
   // A previous scratch database for this product is replaced, so every start is a clean copy.
   await dropOrphanedVerificationDatabase({adminUrl,name:`vf_${previewDatabaseId(productId).slice(0,24)}`,forbiddenNames:forbidden});
   database=await provisionVerificationDatabase({adminUrl,attemptId:previewDatabaseId(productId),forbiddenNames:forbidden});
  }
  let child:ReturnType<typeof spawn>|null=null;
  try{
   const port=await pickPort(portIsFree),env=previewEnv(process.env,{databaseUrl:database?.url??'',sessionSecret:randomBytes(32).toString('hex'),port});
   if(!database)delete env.DATABASE_URL;
   if(database){
    const prisma=path.join(dir,'node_modules','.bin','prisma');
    if(!fs.existsSync(prisma))throw new DomainError('The product uses a database but its Prisma tooling is not installed.');
    const generated=await run(prisma,['generate'],{cwd:dir,env,timeout:STEP_MS.prisma});
    if(generated.code!==0)throw new DomainError(`The product's database client could not be prepared. ${tail(generated.stderr||generated.stdout,4)}`);
    const migrated=await run(prisma,['migrate','deploy'],{cwd:dir,env,timeout:STEP_MS.prisma});
    if(migrated.code!==0)throw new DomainError(`The product's database could not be set up. ${tail(migrated.stderr||migrated.stdout,4)}`);
   }
   const log=fs.openSync(logFile(productId),'w',0o600);
   child=spawn(process.execPath,[nextBin,'dev','-H','127.0.0.1','-p',String(port)],{cwd:dir,env,detached:true,stdio:['ignore',log,log]});child.unref();fs.closeSync(log);
   if(!child.pid)throw new DomainError('The preview could not be started.');
   const record:PreviewRecord={productId,pid:child.pid,port,commit,branch:repo.defaultBranch,databaseName:database?.name??'',startedAt:new Date().toISOString()};
   fs.writeFileSync(recordFile(productId),JSON.stringify(record),{mode:0o600});
   await waitUntilReady(port,record,productId);
   return viewOf(record,true,await subject(productId,commit),pagesOf(productId));
  }catch(error){
   if(child?.pid)try{process.kill(-child.pid,'SIGKILL')}catch{/* already gone */}
   await database?.drop();fs.rmSync(recordFile(productId),{force:true});
   throw error;
  }
 });
}

async function stopQuietly(productId:string){
 const record=readRecord(productId);
 if(record&&await alive(record)){
  try{process.kill(-record.pid,'SIGTERM')}catch{/* already gone */}
  for(let i=0;i<10&&await alive(record);i++)await new Promise(resolve=>setTimeout(resolve,500));
  if(await alive(record))try{process.kill(-record.pid,'SIGKILL')}catch{/* already gone */}
 }
 const adminUrl=verificationDatabaseAdminUrl();
 if(record?.databaseName&&adminUrl)await dropOrphanedVerificationDatabase({adminUrl,name:record.databaseName,forbiddenNames:builderDatabaseNames()});
 fs.rmSync(recordFile(productId),{force:true});
 await fs.promises.rm(sourceDir(productId),{recursive:true,force:true});
}
export function stopPreview(productId:string):Promise<PreviewView>{return exclusive(productId,async()=>{await stopQuietly(productId);return viewOf(null,false)})}
export function previewLogTail(productId:string){return tail(readLog(productId),20)}
