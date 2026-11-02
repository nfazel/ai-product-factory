import {db} from '@/lib/db';
import {operatorConfirmationRequired} from '@/modules/feature-review/authorization';
import {OperatorConfirmationProvider} from './operator-confirmation';
import {LivePreviewPanel} from './live-preview';
/** Server side: the features a person can comment on, and whether the feedback forms ask for the operator credential. */
export async function LivePreviewSection({productId}:{productId:string}){
 const features=await db.workItem.findMany({where:{productId,type:'FEATURE'},orderBy:[{createdAt:'asc'},{id:'asc'}],select:{id:true,title:true}});
 return <OperatorConfirmationProvider required={operatorConfirmationRequired()}><LivePreviewPanel productId={productId} features={features}/></OperatorConfirmationProvider>;
}
