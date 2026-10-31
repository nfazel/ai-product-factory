import 'server-only';
import {createHmac,timingSafeEqual} from 'node:crypto';
import {canonicalJson} from '@/modules/coding/external-manifest';
import {operatorConfirmationAvailable} from '@/modules/feature-review/authorization';
import {DomainError} from '@/modules/shared/errors';
const purpose='AI_PRODUCT_FACTORY_REQUIREMENTS_CONTEXT_CAPTURE_V1\0';
/** Server capture, deliberately not a human approval purpose or identity. */
export function signRequirementsContext(value:unknown){if(!operatorConfirmationAvailable())throw new DomainError('Requirements capture proof is unavailable.');return createHmac('sha256',process.env.EXTERNAL_REVIEW_APPROVAL_KEY!).update(purpose).update(canonicalJson(value)).digest('hex')}
export function validRequirementsContext(value:unknown,signature:string){try{return /^[a-f0-9]{64}$/.test(signature)&&timingSafeEqual(Buffer.from(signature,'hex'),Buffer.from(signRequirementsContext(value),'hex'))}catch{return false}}
