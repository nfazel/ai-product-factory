import 'server-only';
import {createHmac,timingSafeEqual} from 'node:crypto';
import {canonicalJson} from '@/modules/coding/external-manifest';
import {operatorConfirmationAvailable} from '@/modules/feature-review/authorization';
import {DomainError} from '@/modules/shared/errors';
type Purpose='PLANNING_PIN_V2'|'PLANNING_APPROVAL_RECEIPT_V1'|'PLANNING_GENERATION_V1'|'PLANNING_INPUT_PIN_V3'|'PLANNING_PUBLICATION_V1';
export function signPlanningProof(purpose:Purpose,value:unknown){if(!operatorConfirmationAvailable())throw new DomainError('Protected planning proof is unavailable.');return createHmac('sha256',process.env.EXTERNAL_REVIEW_APPROVAL_KEY!).update(`AI_PRODUCT_FACTORY_${purpose}\0`).update(canonicalJson(value)).digest('hex')}
export function validPlanningProof(purpose:Purpose,value:unknown,signature:string){try{return /^[a-f0-9]{64}$/.test(signature)&&timingSafeEqual(Buffer.from(signature,'hex'),Buffer.from(signPlanningProof(purpose,value),'hex'))}catch{return false}}
