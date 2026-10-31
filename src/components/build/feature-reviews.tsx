import {db} from '@/lib/db';
import {getFeatureReview} from '@/modules/feature-review/service';
import {featureReviewView} from '@/modules/feature-review/presentation';
import {FeatureFeedbackEntry} from './feature-feedback-entry';
import {FeatureReviewCard} from './feature-review';
export async function FeatureReviews({productId}:{productId:string}){
 const features=await db.workItem.findMany({where:{productId,type:'FEATURE'},orderBy:[{createdAt:'asc'},{id:'asc'}],select:{id:true,title:true,description:true}});
 return <section id="feature-reviews" className="space-y-4 rounded-xl border p-4"><h2 className="text-lg font-semibold">Feature review and acceptance</h2><p>Inspect features at any time. Formal acceptance follows independent verification.</p>{!features.length&&<p>No features have been defined yet.</p>}{await Promise.all(features.map(async feature=>{try{return <FeatureReviewCard key={feature.id} productId={productId} feature={featureReviewView(await getFeatureReview(productId,feature.id))}/>}catch{return <article key={feature.id} data-feature-id={feature.id}><h3>{feature.title}</h3><p>{feature.description}</p><p>Verification and acceptance status are temporarily unavailable. Acceptance is disabled; review history has not been changed.</p><FeatureFeedbackEntry productId={productId} featureId={feature.id} title={feature.title}/></article>}}))}</section>
}
