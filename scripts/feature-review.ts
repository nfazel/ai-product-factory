/** Local operator only; no browser endpoint or agent command is registered by Task A. */
import 'dotenv/config';
import fs from 'node:fs';
import {db} from '../src/lib/db';
import {getFeatureReview,recordFeatureReview,archiveReviewedFeature} from '../src/modules/feature-review/service';
async function main(){
 const [action,productId,featureId,digest,idempotencyKey,concernsJson,reason]=process.argv.slice(2);
 if(!['inspect','accept','defer','archive'].includes(action)||!productId||!featureId)throw new Error('Invalid feature review command.');
 if(action==='inspect'){process.stdout.write(JSON.stringify(await getFeatureReview(productId,featureId),null,2)+'\n');return}
 const credential=fs.readFileSync(0,'utf8').trim();
 const result=action==='archive'?await archiveReviewedFeature(productId,featureId,credential):await recordFeatureReview({productId,featureId,decision:action==='accept'?'ACCEPTED':'DEFERRED',reviewedDigest:digest??'',idempotencyKey:idempotencyKey??'',acknowledgedConcerns:JSON.parse(concernsJson??'[]'),reason:reason??'',credential});
 process.stdout.write(JSON.stringify(result,null,2)+'\n');
}
main().catch(()=>{console.error('Feature review failed. Check operator confirmation, the reviewed version and current eligibility. No credentials are printed.');process.exitCode=1}).finally(()=>db.$disconnect());
