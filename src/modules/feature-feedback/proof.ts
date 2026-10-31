import 'server-only';
import {createHmac,timingSafeEqual} from 'node:crypto';
import {canonicalJson} from '@/modules/coding/external-manifest';
import {confirmLocalOperator,currentOperatorPrincipal} from '@/modules/feature-review/authorization';
const purpose='AI_PRODUCT_FACTORY_FEEDBACK_DECISION_V1\0';
/** Existing operator adapter/key, purpose separated from feature or technical approvals. */
export function signFeedbackDecision(payload:unknown,credential:string){confirmLocalOperator(credential);return createHmac('sha256',credential).update(purpose).update(canonicalJson(payload)).digest('hex')}
export function validFeedbackDecision(payload:unknown,signature:string,actor:{actorKind:string;actorId:string;actorName:string}){try{const key=process.env.EXTERNAL_REVIEW_APPROVAL_KEY;if(!key||!currentOperatorPrincipal(actor)||!/^[a-f0-9]{64}$/.test(signature))return false;return timingSafeEqual(Buffer.from(signature,'hex'),Buffer.from(signFeedbackDecision(payload,key),'hex'))}catch{return false}}
