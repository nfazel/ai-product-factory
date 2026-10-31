import {canonicalJson,contentHash} from '@/modules/coding/external-manifest';
export type CriterionMember={criterionId:string;workItemId:string;description:string};
export type InitialRequirementsManifest={kind:'INITIAL_REQUIREMENTS_MEMBERSHIP';formatVersion:1;productId:string;version:1;members:CriterionMember[]};
export function initialRequirementsManifest(productId:string,members:CriterionMember[]):InitialRequirementsManifest{return{kind:'INITIAL_REQUIREMENTS_MEMBERSHIP',formatVersion:1,productId,version:1,members:[...members].sort((a,b)=>a.criterionId<b.criterionId?-1:a.criterionId>b.criterionId?1:0)}}
export const baselineDigest=(value:InitialRequirementsManifest)=>contentHash(canonicalJson(value));
