import 'server-only';
import {DockerJob} from './docker';import {snapshotFiles,dependencyArtifacts,verifyPreparedSource,type InputFile} from './inputs';import {ARTIFACT_SERVER} from './services';
export type PreparedSource={files:InputFile[];builder:string;dependencyNetwork:string;cache:string;env:Record<string,string>};
export async function prepareSource(job:DockerJob,root:string,sha:string):Promise<PreparedSource>{
 const files=await snapshotFiles(root,sha),lock=files.find(f=>f.path==='package-lock.json');
 if(!lock)throw new Error('A committed dependency lockfile is required for container verification.');
 const artifacts=await dependencyArtifacts(JSON.parse(lock.bytes.toString()));
 const network=await job.network('dependencies'),cache=await job.container('artifacts',network),builder=await job.container('build',network);
 const index=Object.fromEntries(artifacts.map((a,i)=>[a.path,`${i}.bin`]));
 await job.put(cache,[...artifacts.map((a,i)=>({path:`cache/${i}.bin`,bytes:a.bytes})),{path:'cache/index.json',bytes:Buffer.from(JSON.stringify(index))}]);
 // Start a fixed, credential-free artifact service on the isolated network.
 void job.run(cache,['node','-e',ARTIFACT_SERVER],{},30*60_000).catch(()=>undefined);
 await job.put(builder,files);
 const env={CI:'1',NEXT_TELEMETRY_DISABLED:'1',NPM_CONFIG_REGISTRY:`http://${cache}:8080`,NPM_CONFIG_REPLACE_REGISTRY_HOST:'always',NPM_CONFIG_AUDIT:'false',NPM_CONFIG_FUND:'false',NPM_CONFIG_CACHE:'/work/.npm',PRISMA_ENGINES_MIRROR:`http://${cache}:8080`};
 const installed=await job.run(builder,['npm','ci','--no-audit','--no-fund'],env,10*60_000);
 if(installed.code!==0||installed.timedOut)throw new Error('Isolated dependency preparation failed. '+installed.output);
 await verifyPreparedSource(job,builder,files);
 return{files,builder,dependencyNetwork:network,cache,env};
}
