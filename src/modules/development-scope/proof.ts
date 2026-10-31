import 'server-only';
import {createHmac,timingSafeEqual} from 'node:crypto';
import {canonicalJson} from '@/modules/coding/external-manifest';
import {confirmLocalOperator,currentOperatorPrincipal} from '@/modules/feature-review/authorization';
const purpose='AI_PRODUCT_FACTORY_DEVELOPMENT_SCOPE_V1\0';
export function signScopeDecision(value:unknown,credential:string){confirmLocalOperator(credential);return createHmac('sha256',credential).update(purpose).update(canonicalJson(value)).digest('hex')}
export function validScopeDecision(value:unknown,signature:string,actor:{actorKind:string;actorId:string;actorName:string}){try{const key=process.env.EXTERNAL_REVIEW_APPROVAL_KEY;if(!key||!currentOperatorPrincipal(actor)||!/^[a-f0-9]{64}$/.test(signature))return false;return timingSafeEqual(Buffer.from(signature,'hex'),Buffer.from(signScopeDecision(value,key),'hex'))}catch{return false}}
