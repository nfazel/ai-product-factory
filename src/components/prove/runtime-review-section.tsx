import {OperatorConfirmationProvider} from '@/components/build/operator-confirmation';
import {operatorConfirmationRequired} from '@/modules/feature-review/authorization';
import {RuntimeReviewCard} from './runtime-review-card';
/** Server side: whether the approval form asks for the operator credential. */
export async function RuntimeReviewSection({productId,taskId}:{productId:string;taskId:string}){
 return <OperatorConfirmationProvider required={operatorConfirmationRequired()}><RuntimeReviewCard productId={productId} taskId={taskId}/></OperatorConfirmationProvider>;
}
