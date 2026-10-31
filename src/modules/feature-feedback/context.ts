import 'server-only';
import {db} from '@/lib/db';
import {loadFeatureManifest,type ReviewReader} from '@/modules/feature-review/loader';
import {canonicalJson,contentHash} from '@/modules/coding/external-manifest';
import {DomainError} from '@/modules/shared/errors';
/** Raw read only: never call getFeatureReview/reconcile while collecting intent. */
export async function feedbackContext(productId:string,featureId:string,reader:ReviewReader=db){
 const value=await loadFeatureManifest(productId,featureId,reader);
 if(value.productArchived||value.scope.some(item=>item.archivedAt))throw new DomainError('Archived features are read-only.');
 return {kind:'FEATURE_FEEDBACK_CONTEXT' as const,version:1,productId,featureId,definitionIdentity:value.definitionIdentity,requirementsApproved:value.requirementsApproved,scope:value.scope,requirements:value.requirements,taskIds:value.taskIds,build:value.build};
}
export type FeedbackContext=Awaited<ReturnType<typeof feedbackContext>>;
export const contextDigest=(value:FeedbackContext)=>contentHash(canonicalJson(value));
