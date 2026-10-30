import {createHmac} from 'node:crypto';
import {canonicalJson} from '@/modules/coding/external-manifest';
import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest';
import {confirmLocalOperator,signFeatureDecision,validFeatureDecision,rejectOperatorSecret} from './authorization';
const key='synthetic-feature-operator-key-32-bytes';
beforeEach(()=>vi.stubEnv('EXTERNAL_REVIEW_APPROVAL_KEY',key));afterEach(()=>vi.unstubAllEnvs());
describe('protected local human feature confirmation',()=>{
 it('requires the configured operator credential and derives its own principal',()=>{expect(()=>confirmLocalOperator('Local user')).toThrow();expect(confirmLocalOperator(key)).toMatchObject({kind:'LOCAL_OPERATOR',name:'Local operator'});expect(confirmLocalOperator(key).id).not.toContain(key)});
 it('fails closed without a configured credential',()=>{vi.stubEnv('EXTERNAL_REVIEW_APPROVAL_KEY','');expect(()=>confirmLocalOperator(key)).toThrow();expect(validFeatureDecision({},'a'.repeat(64))).toBe(false)});
 it('binds decision signatures to the full content',()=>{const value={decision:'ACCEPTED',digest:'version',featureId:'f'};const signature=signFeatureDecision(value);expect(validFeatureDecision(value,signature)).toBe(true);expect(validFeatureDecision({...value,featureId:'other'},signature)).toBe(false);expect(validFeatureDecision({...value,decision:'DEFERRED'},signature)).toBe(false)});
 it('does not accept signatures from another operator approval purpose',()=>{const value={decision:'ACCEPTED',featureId:'f'};const other=createHmac('sha256',key).update(canonicalJson(value)).digest('hex');expect(validFeatureDecision(value,other)).toBe(false)});
 it('rejects operator secrets and encoded variants in review metadata',()=>{for(const value of [key,encodeURIComponent(key),Buffer.from(key).toString('base64')])expect(()=>rejectOperatorSecret({reason:value})).toThrow()});
});
