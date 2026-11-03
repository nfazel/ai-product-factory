import 'server-only';
import {execFile} from 'node:child_process';import {promisify} from 'node:util';import {createHash} from 'node:crypto';import {gunzipSync} from 'node:zlib';
import {isSecretPath} from '@/modules/coding/policy';import {SOURCE_BYTES,ARTIFACT_BYTES} from './policy';
const exec=promisify(execFile);
export type InputFile={path:string;bytes:Buffer;mode?:number};
export function safeInputPath(path:string){return !!path&&!path.startsWith('/')&&!/[\x00-\x1f\\]/.test(path)&&!path.split('/').some(p=>!p||p==='.'||p==='..'||p==='.git')&&Buffer.byteLength(path)<=240&&!isSecretPath(path)}
export async function snapshotFiles(root:string,commit:string):Promise<InputFile[]>{
 if(!/^[a-f0-9]{40}$/.test(commit))throw new Error('A resolved approved snapshot is required.');
 const git=async(args:string[])=> (await exec('git',['--no-replace-objects','-c','core.fsmonitor=false',...args],{cwd:root,env:{NODE_ENV:'production',PATH:process.env.PATH,GIT_CONFIG_NOSYSTEM:'1'},encoding:'buffer',maxBuffer:SOURCE_BYTES,timeout:30000})).stdout;
 const files:InputFile[]=[];let size=0;
 for(const entry of (await git(['ls-tree','-rlz','--full-tree',commit])).toString('utf8').split('\0').filter(Boolean)){
  const tab=entry.indexOf('\t'),[mode,kind,oid,length]=entry.slice(0,tab).trim().split(/\s+/),path=entry.slice(tab+1);size+=Number(length);
  if(!safeInputPath(path)||kind!=='blob'||!['100644','100755'].includes(mode)||!Number.isFinite(size)||size>SOURCE_BYTES||files.length>=2000)throw new Error('Snapshot contains an unsupported path, secret, link or excessive source input.');
  files.push({path,bytes:await git(['cat-file','blob',oid]),mode:parseInt(mode,8)&0o777});
 }
 return files;
}
/**
 * Path, content hash and mode of every file in a commit. A commit id fixes its contents, so the answer is remembered
 * (a few at a time): reading every file from Git on each page view is what made pages slow. Failures are never remembered.
 */
const fingerprints=new Map<string,Promise<{path:string;hash:string;mode:number}[]>>();
export function snapshotFingerprints(root:string,commit:string){
 const key=`${root}\0${commit}`,known=fingerprints.get(key);if(known)return known;
 const pending=snapshotFiles(root,commit).then(files=>files.map(file=>({path:file.path,hash:createHash('sha256').update(file.bytes).digest('hex'),mode:file.mode??0o644})));
 fingerprints.set(key,pending);pending.catch(()=>{if(fingerprints.get(key)===pending)fingerprints.delete(key)});
 while(fingerprints.size>16)fingerprints.delete(fingerprints.keys().next().value!);
 return pending;
}
/** USTAR, regular files only. No generated archive is extracted onto the host. */
export function* inputTar(files:InputFile[]){
 for(const file of files){if(!safeInputPath(file.path))throw new Error('Unsafe archive input.');const header=Buffer.alloc(512),parts=file.path.split('/');const name=parts.pop()!,prefix=parts.join('/');if(Buffer.byteLength(name)>100||Buffer.byteLength(prefix)>155)throw new Error('Unsupported archive path.');
  header.write(name,0,100);const oct=(n:number,offset:number,length:number)=>header.write(n.toString(8).padStart(length-1,'0')+'\0',offset,length);
  oct(file.mode??0o600,100,8);oct(1000,108,8);oct(1000,116,8);oct(file.bytes.length,124,12);oct(0,136,12);header.fill(32,148,156);header[156]=48;header.write('ustar\0',257,6);header.write('00',263,2);header.write(prefix,345,155);const sum=header.reduce((a,b)=>a+b,0);header.write(sum.toString(8).padStart(6,'0')+'\0 ',148,8);yield header;yield file.bytes;const padding=(512-file.bytes.length%512)%512;if(padding)yield Buffer.alloc(padding);
 }yield Buffer.alloc(1024);
}
export function archiveEntry(tar:Buffer,wanted:string){let offset=0;while(offset+512<=tar.length){const h=tar.subarray(offset,offset+512);if(h.every(b=>b===0))break;const base=h.subarray(0,100).toString().replace(/\0[\s\S]*$/,''),prefix=h.subarray(345,500).toString().replace(/\0[\s\S]*$/,''),name=prefix?prefix+'/'+base:base,size=parseInt(h.subarray(124,136).toString().replace(/\0[\s\S]*$/,'').trim(),8);if(!Number.isFinite(size)||size<0||offset+512+size>tar.length)throw new Error('Invalid verified package archive.');if(name===wanted&&h[156]===48)return tar.subarray(offset+512,offset+512+size);offset+=512+Math.ceil(size/512)*512}throw new Error('Required package metadata is unavailable.');}
export type Artifact={path:string;bytes:Buffer;sha256:string};
/** Trusted download phase. No application scripts, credentials or caller URLs. */
export async function dependencyArtifacts(lock:unknown,fetcher:typeof fetch=fetch,signal:AbortSignal=AbortSignal.timeout(600000)):Promise<Artifact[]>{
 const packages=(lock as {lockfileVersion?:number;packages?:Record<string,Record<string,unknown>>})?.packages;
 if(!packages)throw new Error('A supported committed npm lockfile is required.');const result:Artifact[]=[],seen=new Set<string>();let size=0;
 const download=async(url:string,max=128*1024*1024)=>{const u=new URL(url);if(u.protocol!=='https:'||!['registry.npmjs.org','binaries.prisma.sh'].includes(u.hostname)||u.username||u.password||(u.port&&u.port!=='443')||u.search||u.hash)throw new Error('Dependency URL is not permitted.');const response=await fetcher(u,{redirect:'error',signal:AbortSignal.any([signal,AbortSignal.timeout(60000)])});if(!response.ok||!response.body)throw new Error('An integrity-bound dependency artifact could not be downloaded.');let count=0;const chunks:Buffer[]=[];for await(const part of response.body as unknown as AsyncIterable<Uint8Array>){count+=part.length;if(count>max||size+count>ARTIFACT_BYTES)throw new Error('Dependency artifact storage limit exceeded.');chunks.push(Buffer.from(part))}return Buffer.concat(chunks)};
 const add=(path:string,bytes:Buffer)=>{if(seen.has(path))return;size+=bytes.length;if(size>ARTIFACT_BYTES)throw new Error('Dependency artifact storage limit exceeded.');seen.add(path);result.push({path,bytes,sha256:createHash('sha256').update(bytes).digest('hex')})};
 for(const [name,p]of Object.entries(packages)){
  if(!name.startsWith('node_modules/')||p.link||p.inBundle)continue;
  const matches=(field:unknown,target:string)=>!Array.isArray(field)||(field.includes(target)||!field.some(x=>typeof x==='string'&&!x.startsWith('!')))&&!field.includes('!'+target);
  if(!matches(p.os,'linux')||!matches(p.cpu,'x64')||!matches(p.libc,'glibc')){if(p.optional)continue;throw new Error('A required dependency does not support the approved runtime platform.');}
  if(typeof p.resolved!=='string'||typeof p.integrity!=='string')throw new Error('An immutable registry dependency is required.');const url=new URL(p.resolved);if(url.hostname!=='registry.npmjs.org')throw new Error('Unsupported dependency registry.');const path=url.pathname;if(seen.has(path))continue;const integrity=p.integrity.split(/\s+/).find(s=>/^sha(?:256|384|512)-/.test(s));if(!integrity)throw new Error('A strong lockfile integrity hash is required.');const split=integrity.indexOf('-'),algorithm=integrity.slice(0,split),expected=integrity.slice(split+1),bytes=await download(url.toString());if(createHash(algorithm).update(bytes).digest('base64')!==expected)throw new Error('Dependency integrity check failed.');add(path,bytes);
  if(name.endsWith('/@prisma/engines-version')){
   const pkg=JSON.parse(archiveEntry(gunzipSync(bytes,{maxOutputLength:1024*1024}),'package/package.json').toString());const commit=pkg.prisma?.enginesVersion;if(typeof commit!=='string'||!/^[a-f0-9]{40}$/.test(commit))throw new Error('Unsupported Prisma engine metadata.');
   for(const engine of ['schema-engine','libquery_engine.so.node']){const path=`/all_commits/${commit}/debian-openssl-3.0.x/${engine}.gz`,gzip=await download('https://binaries.prisma.sh'+path),gzHash=await download('https://binaries.prisma.sh'+path+'.sha256',1024),rawHash=await download('https://binaries.prisma.sh'+path.replace(/\.gz$/,'')+'.sha256',1024);if(!/^[a-f0-9]{64}/.test(gzHash.toString())||createHash('sha256').update(gzip).digest('hex')!==gzHash.toString().trim().split(/\s+/)[0])throw new Error('Engine artifact checksum failed.');const raw=gunzipSync(gzip,{maxOutputLength:128*1024*1024});if(createHash('sha256').update(raw).digest('hex')!==rawHash.toString().trim().split(/\s+/)[0])throw new Error('Engine integrity check failed.');add(path,gzip);add(path+'.sha256',gzHash);add(path.replace(/\.gz$/,'')+'.sha256',rawHash)}
  }
 }
 return result;
}

export async function verifyPreparedSource(job:import('./docker').DockerJob,container:string,files:InputFile[]){
 const hashes=files.map(f=>[f.path,createHash('sha256').update(f.bytes).digest('hex')]);
 const program=`const fs=require('node:fs'),crypto=require('node:crypto');for(const[p,h]of JSON.parse(process.env.APF_HASHES)){if(crypto.createHash('sha256').update(fs.readFileSync('/work/'+p)).digest('hex')!==h)process.exit(125)}console.log('APPROVED_SOURCE_CONFIRMED')`;
 const result=await job.run(container,['node','-e',program],{APF_HASHES:JSON.stringify(hashes)});if(result.code!==0)throw new Error('Dependency preparation changed the approved application source.');
}
