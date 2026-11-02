import {createHmac} from 'node:crypto';
import {canonicalJson} from '@/modules/coding/external-manifest';
import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest';
import {confirmLocalOperator,signFeatureDecision,validFeatureDecision,rejectOperatorSecret,operatorConfirmationRequired,resolveOperatorCredential} from './authorization';
const key='synthetic-feature-operator-key-32-bytes';
beforeEach(()=>vi.stubEnv('EXTERNAL_REVIEW_APPROVAL_KEY',key));afterEach(()=>vi.unstubAllEnvs());
describe('protected local human feature confirmation',()=>{
 it('requires the configured operator credential and derives its own principal',()=>{expect(()=>confirmLocalOperator('Local user')).toThrow();expect(confirmLocalOperator(key)).toMatchObject({kind:'LOCAL_OPERATOR',name:'Local operator'});expect(confirmLocalOperator(key).id).not.toContain(key)});
 it('fails closed without a configured credential',()=>{vi.stubEnv('EXTERNAL_REVIEW_APPROVAL_KEY','');expect(()=>confirmLocalOperator(key)).toThrow();expect(validFeatureDecision({},'a'.repeat(64))).toBe(false)});
 it('binds decision signatures to the full content',()=>{const value={decision:'ACCEPTED',digest:'version',featureId:'f'};const signature=signFeatureDecision(value);expect(validFeatureDecision(value,signature)).toBe(true);expect(validFeatureDecision({...value,featureId:'other'},signature)).toBe(false);expect(validFeatureDecision({...value,decision:'DEFERRED'},signature)).toBe(false)});
 it('does not accept signatures from another operator approval purpose',()=>{const value={decision:'ACCEPTED',featureId:'f'};const other=createHmac('sha256',key).update(canonicalJson(value)).digest('hex');expect(validFeatureDecision(value,other)).toBe(false)});
 it('rejects operator secrets and encoded variants in review metadata',()=>{for(const value of [key,encodeURIComponent(key),Buffer.from(key).toString('base64')])expect(()=>rejectOperatorSecret({reason:value})).toThrow()});
});

describe('operator confirmation switch',()=>{
 const saved={mode:process.env.OPERATOR_CONFIRMATION,key:process.env.EXTERNAL_REVIEW_APPROVAL_KEY};
 const longKey='k'.repeat(40);
 afterEach(()=>{for(const [name,value] of [['OPERATOR_CONFIRMATION',saved.mode],['EXTERNAL_REVIEW_APPROVAL_KEY',saved.key]] as const){if(value===undefined)delete process.env[name];else process.env[name]=value}});
 it('is required by default and for any value other than off',()=>{delete process.env.OPERATOR_CONFIRMATION;expect(operatorConfirmationRequired()).toBe(true);for(const value of ['on','','false','0','disabled']){process.env.OPERATOR_CONFIRMATION=value;expect(operatorConfirmationRequired()).toBe(true)}});
 it('can be switched off, case and space insensitively',()=>{for(const value of ['off','OFF',' Off ']){process.env.OPERATOR_CONFIRMATION=value;expect(operatorConfirmationRequired()).toBe(false)}});
 it('passes the typed credential through while required',()=>{delete process.env.OPERATOR_CONFIRMATION;process.env.EXTERNAL_REVIEW_APPROVAL_KEY=longKey;expect(resolveOperatorCredential('typed')).toBe('typed');expect(resolveOperatorCredential('')).toBe('')});
 it('supplies the configured key when off, so existing signing and proofs are unchanged',()=>{process.env.OPERATOR_CONFIRMATION='off';process.env.EXTERNAL_REVIEW_APPROVAL_KEY=longKey;expect(resolveOperatorCredential('')).toBe(longKey);expect(confirmLocalOperator(resolveOperatorCredential('')).kind).toBe('LOCAL_OPERATOR')});
 it('fails closed when off but no usable key is configured',()=>{process.env.OPERATOR_CONFIRMATION='off';delete process.env.EXTERNAL_REVIEW_APPROVAL_KEY;expect(resolveOperatorCredential('')).toBe('');expect(()=>confirmLocalOperator(resolveOperatorCredential(''))).toThrow();process.env.EXTERNAL_REVIEW_APPROVAL_KEY='too-short';expect(()=>confirmLocalOperator(resolveOperatorCredential(''))).toThrow()});
});
