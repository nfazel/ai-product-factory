import 'server-only';
import {createHmac,timingSafeEqual} from 'node:crypto';
import {canonicalJson,contentHash,requireReviewCredential} from '@/modules/coding/external-manifest';
import {DomainError} from '@/modules/shared/errors';
const KEY='EXTERNAL_REVIEW_APPROVAL_KEY';
const PURPOSE='AI_PRODUCT_FACTORY_FEATURE_REVIEW_V1\0';
export type HumanReviewPrincipal={kind:'LOCAL_OPERATOR';id:string;name:string};
/** Replace this adapter with authenticated-user authorization later; never trust an actor supplied by the caller. */
function configuredPrincipal():HumanReviewPrincipal{
 if(!process.env[KEY]||Buffer.byteLength(process.env[KEY]!)<32)throw new DomainError('Protected operator confirmation is unavailable.');
 return {kind:'LOCAL_OPERATOR',id:`local-operator:${contentHash(process.env[KEY]!).slice(0,24)}`,name:'Local operator'};
}
export function confirmLocalOperator(credential:string):HumanReviewPrincipal{requireReviewCredential(credential,process.env[KEY]);return configuredPrincipal()}
export function currentOperatorPrincipal(value:{actorKind:string;actorId:string;actorName:string}){try{const principal=configuredPrincipal();return value.actorKind===principal.kind&&value.actorId===principal.id&&value.actorName===principal.name}catch{return false}}
export function rejectOperatorSecret(value:unknown){const key=process.env[KEY];if(!key||Buffer.byteLength(key)<32)return;const text=canonicalJson(value);if([key,encodeURIComponent(key),Buffer.from(key).toString('base64'),JSON.stringify(key).slice(1,-1)].some(secret=>text.includes(secret)))throw new DomainError('Operator credentials cannot appear in review data.');}
export function signFeatureDecision(value:unknown){const key=process.env[KEY];if(!key||Buffer.byteLength(key)<32)throw new DomainError('Protected operator confirmation is unavailable.');return createHmac('sha256',key).update(PURPOSE).update(canonicalJson(value)).digest('hex')}
export function validFeatureDecision(value:unknown,signature:string){try{if(typeof signature!=='string'||!/^[a-f0-9]{64}$/.test(signature))return false;return timingSafeEqual(Buffer.from(signature,'hex'),Buffer.from(signFeatureDecision(value),'hex'))}catch{return false}}

export function operatorConfirmationAvailable(){return Boolean(process.env[KEY]&&Buffer.byteLength(process.env[KEY]!)>=32)}

/**
 * Proof-of-concept switch. OPERATOR_CONFIRMATION=off lets the local human's click stand in for typing the credential;
 * the server then supplies its own configured key at the action boundary, so signing and proofs are unchanged.
 * The default is ON. The same-origin/localhost checks in the server actions still apply.
 */
export function operatorConfirmationRequired(){return process.env.OPERATOR_CONFIRMATION?.trim().toLowerCase()!=='off'}
export function resolveOperatorCredential(supplied:string){
 if(operatorConfirmationRequired())return supplied;
 const key=process.env[KEY];
 return key&&Buffer.byteLength(key)>=32?key:supplied;
}
