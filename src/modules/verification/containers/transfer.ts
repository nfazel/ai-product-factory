import 'server-only';
import {spawn} from 'node:child_process';import {homedir,tmpdir} from 'node:os';import {randomUUID} from 'node:crypto';import path from 'node:path';import {Transform} from 'node:stream';import {pipeline} from 'node:stream/promises';import {DockerJob} from './docker';import {WORK_BYTES} from './policy';
/** Copies bounded job-derived artifacts through pipes. No bind mount, host
 * extraction, shell expansion or secret-bearing command argument is involved. */
export async function transferArtifacts(job:DockerJob,from:string,to:string,dirs:string[]){
 const prefix=job.prefix+'-';if(!from.startsWith(prefix)||!to.startsWith(prefix)||!dirs.length||dirs.some(d=>!['node_modules','.next','dist','build'].includes(d)))throw new Error('Unsupported isolated artifact transfer.');
 const options={env:{NODE_ENV:'production' as const,PATH:process.env.PATH,DOCKER_CONFIG:path.join(tmpdir(),'apf-docker-empty-'+randomUUID())},stdio:['pipe','pipe','pipe'] as ['pipe','pipe','pipe']};
 const endpoint=`unix://${homedir()}/.docker/run/docker.sock`;
 const source=spawn('docker',['--host',endpoint,'exec','--user', /-(?:app|test|snapshot)$/.test(from)?'65534:65534':'1000:1000',from,'tar','-cf','-','-C','/work','--',...dirs],options);
 const destination=spawn('docker',['--host',endpoint,'exec','-i','--user', /-(?:app|test|snapshot)$/.test(to)?'65534:65534':'1000:1000',to,'tar','-xf','-','--no-same-owner','--no-same-permissions','-C','/work'],options);
 source.stdin.end();source.stderr.resume();destination.stderr.resume();destination.stdout.resume();let bytes=0,timedOut=false,tail=Buffer.alloc(0);const sensitive=job.secrets.flatMap(s=>[s,encodeURIComponent(s),Buffer.from(s).toString('base64')]).filter(s=>s.length>=8).map(s=>Buffer.from(s));const overlap=Math.max(1,...sensitive.map(s=>s.length));
 const timer=setTimeout(()=>{timedOut=true;source.kill('SIGKILL');destination.kill('SIGKILL');void job.cleanup().catch(()=>undefined)},120000);
 const closed=(child:typeof source)=>new Promise<number|null>(resolve=>{child.on('error',()=>resolve(null));child.on('close',resolve)});
 const results=[closed(source),closed(destination)];
 try{await pipeline(source.stdout,new Transform({transform(chunk:Buffer,encoding,callback){bytes+=chunk.length;const joined=Buffer.concat([tail,chunk]);if(sensitive.some(s=>joined.includes(s)))return callback(new Error('A private runtime credential was written into an application artifact.'));tail=Buffer.from(joined.subarray(-overlap));if(bytes>WORK_BYTES)return callback(new Error('Artifact transfer limit exceeded.'));callback(null,chunk)}}),destination.stdin);const codes=await Promise.all(results);if(timedOut||codes.some(c=>c!==0))throw new Error('Isolated artifact transfer failed.');}catch{await job.cleanup();throw new Error('Isolated artifact transfer failed safely.')}finally{clearTimeout(timer)}
}
