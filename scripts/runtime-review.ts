/** Local operator only. Not an agent tool or public server action. */
import 'dotenv/config';
import fs from 'node:fs';
import { getCurrentActor } from '../src/modules/identity/actor';
import { db } from '../src/lib/db';
import { prepareRuntimeReview, approveRuntimeReview } from '../src/modules/verification/runtime-review';
import { runtimeManifestDigest } from '../src/modules/verification/runtime-manifest';
async function main() {
  const [action,productId,workspaceId,digest,reason] = process.argv.slice(2);
  if (!['prepare','approve'].includes(action) || !productId || !workspaceId) throw new Error('Usage: runtime-review.ts prepare|approve productId workspaceId [reviewedDigest] [humanReviewReason]. Approval credential is read from stdin, never arguments.');
  if (action === 'prepare') {
    const manifest=await prepareRuntimeReview(productId,workspaceId);
    process.stdout.write(JSON.stringify({manifest,digest:runtimeManifestDigest(manifest)},null,2)+'\n');return;
  }
  if(!digest)throw new Error('Supply the exact reviewed manifest digest.');
  const credential=fs.readFileSync(0,'utf8').trim();
  const result=await approveRuntimeReview({productId,workspaceId,digest,reason:reason??'',credential,actor:getCurrentActor()});
  process.stdout.write(JSON.stringify(result,null,2)+'\n');
}
main().catch(()=>{console.error('Runtime review failed. Check the reviewed task, source, runtime identity and operator authorization. No credential is printed.');process.exitCode=1}).finally(()=>db.$disconnect());
